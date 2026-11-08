import { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkAbaTransaction,
  loadAbaMerchantConfig,
  verifyAbaCallback,
} from "@/lib/payments/aba-payway";
import { createConfiguredPaymentProvider } from "@/lib/payments/payment-provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() === "aba_payway") {
    return handleAbaWebhook(request);
  }

  try {
    const provider = createConfiguredPaymentProvider();
    const verification = await provider.verifyWebhook(request);

    if (!verification.ok || !verification.event) {
      return Response.json(
        {
          accepted: false,
          reason: verification.reason ?? "Webhook verification failed.",
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const result = await provider.handleWebhook(verification.event);

    return Response.json(
      {
        accepted: result.accepted,
        reason: result.reason,
        providerTransactionId: result.providerTransactionId,
      },
      {
        status: result.accepted ? 200 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";

    return Response.json(
      { accepted: false, reason: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function handleAbaWebhook(request: NextRequest) {
  let verification: Awaited<ReturnType<typeof verifyAbaCallback>>;
  try {
    const configSupabase = createAdminClient();
    await loadAbaMerchantConfig(configSupabase);
  } catch {
    return Response.json(
      { accepted: false, reason: "Payment service is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    verification = await verifyAbaCallback(request);
  } catch {
    return Response.json(
      { accepted: false, reason: "ABA PayWay is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!verification.valid || !verification.payload) {
    return Response.json(
      { accepted: false, reason: "Invalid PayWay callback signature." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const tranId = verification.payload.tran_id;
  if (typeof tranId !== "string" || !/^\d{10,20}$/.test(tranId)) {
    return Response.json(
      { accepted: false, reason: "Invalid transaction reference." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabase = createAdminClient();
    const signature = request.headers.get("x-payway-hmac-sha512");
    const { data: webhook, error: webhookError } = await supabase
      .from("payment_webhooks")
      .insert({
        provider: "aba_payway",
        tran_id: tranId,
        event_type: String(verification.payload.status ?? "payment.updated"),
        payload: verification.payload,
        signature,
      })
      .select("id")
      .single();
    if (webhookError) throw webhookError;

    const { data: payment, error: paymentError } = await supabase
      .from("payment_transactions")
      .select("id, donation_id, amount, currency, status, expires_at, created_at")
      .eq("provider", "aba_payway")
      .eq("tran_id", tranId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      await markWebhookProcessed(supabase, webhook.id);
      return Response.json(
        { accepted: false, reason: "Payment transaction not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (payment.status !== "pending" && payment.status !== "processing") {
      await markWebhookProcessed(supabase, webhook.id);
      return Response.json(
        { accepted: true, status: payment.status, tranId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const checked = await checkAbaTransaction(tranId);
    if (checked.paymentStatus === "PENDING") {
      return Response.json(
        { accepted: true, status: "pending", tranId },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (checked.paymentStatus === "APPROVED") {
      const paidAt = parseAbaDate(checked.transactionDate);
      if (
        checked.paymentAmount !== Number(payment.amount) ||
        checked.paymentCurrency !== payment.currency ||
        !paidAt ||
        paidAt.getTime() < new Date(payment.created_at).getTime() - 60_000 ||
        paidAt.getTime() > new Date(payment.expires_at).getTime()
      ) {
        await supabase.rpc(
          "streamkit_transition_aba_payment",
          {
            p_payment_id: payment.id,
            p_target_status: "review_required",
            p_failure_reason: "verified_transaction_mismatch",
            p_webhook_id: webhook.id,
          },
        ).then(({ error }) => {
          if (error) throw error;
        });
        return Response.json(
          { accepted: false, reason: "Verified payment did not match the request." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      const { error: completionError } = await supabase.rpc(
        "streamkit_complete_aba_payment",
        {
          p_payment_id: payment.id,
          p_provider_transaction_id: checked.providerTransactionId ?? "",
          p_verified_amount: checked.paymentAmount,
          p_verified_currency: checked.paymentCurrency,
          p_provider_paid_at: paidAt.toISOString(),
        },
      );
      if (completionError) throw completionError;
    } else {
      const terminalStatus =
        checked.paymentStatus === "CANCELLED"
          ? "cancelled"
          : checked.paymentStatus === "REFUNDED"
            ? "refunded"
            : "failed";

      const { error: transitionError } = await supabase.rpc(
        "streamkit_transition_aba_payment",
        {
          p_payment_id: payment.id,
          p_target_status: terminalStatus,
          p_failure_reason: null,
          p_webhook_id: webhook.id,
        },
      );

      if (transitionError) throw transitionError;

      return Response.json(
        { accepted: true, status: checked.paymentStatus, tranId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    await markWebhookProcessed(supabase, webhook.id);
    return Response.json(
      { accepted: true, status: checked.paymentStatus, tranId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { accepted: false, reason: "Unable to verify PayWay transaction." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function markWebhookProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  webhookId: string,
) {
  const { error } = await supabase
    .from("payment_webhooks")
    .update({ processed: true })
    .eq("id", webhookId);
  if (error) throw error;
}

function parseAbaDate(value: string | null) {
  if (!value) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value.replace(" ", "T")}+07:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
