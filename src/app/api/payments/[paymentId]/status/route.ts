import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkBakongTransaction,
  getBakongConfig,
  getBakongMerchant,
  loadBakongMerchantConfig,
} from "@/lib/payments/bakong";
import { checkAbaTransaction, loadAbaMerchantConfig } from "@/lib/payments/aba-payway";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";

export const runtime = "nodejs";

type PaymentContext = { params: Promise<{ paymentId: string }> };

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_request: NextRequest, { params }: PaymentContext) {
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId))
    return json({ error: "Payment not found." }, 404);

  try {
    const supabase = createAdminClient();
    await loadAbaMerchantConfig(supabase);
    await loadBakongMerchantConfig(supabase);
    const { data: payment, error } = await supabase
      .from("payment_transactions")
      .select(
        "id, creator_id, donor_name, amount, currency, message, provider, provider_md5, tran_id, donation_id, status, expires_at, created_at, provider_hash",
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (error) throw error;
    if (!payment) return json({ error: "Payment not found." }, 404);

    if (payment.provider === "aba_payway") {
      if (payment.status === "completed") return await paymentResult(supabase, payment);
      if (payment.status !== "pending" && payment.status !== "processing") {
        return json({ status: payment.status });
      }
      if (!payment.tran_id) return json({ error: "Payment not found." }, 404);

      if (
        !(await allowPaymentRequest(
          supabase,
          _request,
          `aba-status:${payment.id}`,
          1,
          4,
        ))
      ) {
        return Response.json(
          { status: "pending", retryAfterSeconds: 4 },
          {
            status: 429,
            headers: { "Cache-Control": "no-store", "Retry-After": "4" },
          },
        );
      }

      const verified = await checkAbaTransaction(
        payment.tran_id,
        undefined,
        payment.currency === "KHR" ? "KHR" : "USD",
      );
      if (verified.paymentStatus === "PENDING") {
        if (Date.now() >= new Date(payment.expires_at).getTime()) {
          await Promise.all([
            supabase
              .from("payment_transactions")
              .update({ status: "expired" })
              .eq("id", payment.id)
              .in("status", ["pending", "processing"]),
            supabase
              .from("donations")
              .update({ status: "failed" })
              .eq("id", payment.donation_id),
          ]);
          return json({ status: "expired" });
        }
        return json({ status: "pending", retryAfterSeconds: 5 });
      }

      const paidAt = parseAbaDate(verified.transactionDate);
      const isApproved = verified.paymentStatus === "APPROVED";
      if (isApproved) {
        const expiresAt = new Date(payment.expires_at);
        if (
          verified.paymentAmount !== Number(payment.amount) ||
          verified.paymentCurrency !== payment.currency ||
          !paidAt ||
          paidAt.getTime() < new Date(payment.created_at).getTime() - 60_000 ||
          paidAt.getTime() > expiresAt.getTime()
        ) {
          await Promise.all([
            supabase
              .from("payment_transactions")
              .update({ status: "failed", failure_reason: "amount_or_currency_mismatch" })
              .eq("id", payment.id)
              .in("status", ["pending", "processing"]),
            supabase
              .from("donations")
              .update({ status: "failed" })
              .eq("id", payment.donation_id),
          ]);
          return json({ status: "failed" });
        }

        const { error: completionError } = await supabase.rpc(
          "streamkit_complete_aba_payment",
          {
            p_payment_id: payment.id,
            p_provider_transaction_id: verified.providerTransactionId ?? "",
            p_verified_amount: verified.paymentAmount,
            p_verified_currency: verified.paymentCurrency,
            p_provider_paid_at: paidAt.toISOString(),
          },
        );
        if (completionError) throw completionError;

        const { data: completedPayment, error: completedError } = await supabase
          .from("payment_transactions")
          .select(
            "id, creator_id, donor_name, amount, currency, message, provider, provider_md5, tran_id, donation_id, status, expires_at, created_at, provider_hash",
          )
          .eq("id", payment.id)
          .single();
        if (completedError) throw completedError;
        return await paymentResult(supabase, completedPayment);
      }

      const terminalStatus =
        verified.paymentStatus === "CANCELLED" ? "cancelled" : "failed";
      await Promise.all([
        supabase
          .from("payment_transactions")
          .update({ status: terminalStatus })
          .eq("id", payment.id)
          .in("status", ["pending", "processing"]),
        supabase
          .from("donations")
          .update({ status: terminalStatus })
          .eq("id", payment.donation_id),
      ]);
      return json({ status: terminalStatus });
    }

    // khqr/route.ts issues the QR with the creator's own bakong_id when they set
    // one, so verification has to compare against that same account. Reading it
    // from the env here would send a paying creator to "review_required"
    // forever the moment bakong_id differs from BAKONG_ACCOUNT_ID.
    const { data: creatorBakong } = await supabase
      .from("creator_tip_settings")
      .select("bakong_id")
      .eq("creator_id", payment.creator_id)
      .maybeSingle();
    const creatorAccountId = (creatorBakong?.bakong_id ?? "").trim();
    const merchant = creatorAccountId
      ? { accountId: creatorAccountId }
      : getBakongMerchant();
    if (!merchant)
      return json({ error: "Bakong payments are not configured yet." }, 503);

    if (payment.status !== "pending")
      return await paymentResult(supabase, payment);

    const expiresAt = new Date(payment.expires_at);
    if (Date.now() >= expiresAt.getTime()) {
      await supabase
        .from("payment_transactions")
        .update({ status: "expired" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return json({ status: "expired" });
    }

    if (
      !(await allowPaymentRequest(
        supabase,
        _request,
        `payment-status:${payment.id}`,
        1,
        4,
      ))
    ) {
      return Response.json(
        { status: "pending", retryAfterSeconds: 4 },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "4" },
        },
      );
    }

    // The QR stays valid even without a Bakong API token — we just cannot confirm
    // the payment automatically, so keep the donor on the QR until it expires.
    if (!getBakongConfig()) {
      return json({ status: "pending", awaitingConfirmation: true, retryAfterSeconds: 10 });
    }

    const verification = await checkBakongTransaction(payment.provider_md5);
    if (verification.responseCode !== 0 || !verification.data) {
      if (verification.errorCode === 3) {
        await supabase
          .from("payment_transactions")
          .update({ status: "failed" })
          .eq("id", payment.id)
          .eq("status", "pending");
        return json({ status: "failed" });
      }
      return json({ status: "pending", retryAfterSeconds: 5 });
    }

    const paidAmount = Number(verification.data.amount);
    const paidAt = Number(verification.data.createdDateMs);
    const valid =
      Number.isFinite(paidAmount) &&
      paidAmount === Number(payment.amount) &&
      verification.data.currency === payment.currency &&
      verification.data.toAccountId.toLowerCase() ===
        merchant.accountId.toLowerCase() &&
      Number.isFinite(paidAt) &&
      paidAt >= new Date(payment.created_at).getTime() - 60000 &&
      paidAt <= expiresAt.getTime();

    if (!valid) {
      await supabase
        .from("payment_transactions")
        .update({ status: "review_required" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return json({ status: "review_required" });
    }

    const { error: completionError } = await supabase.rpc(
      "streamkit_complete_bakong_payment",
      {
        p_payment_id: payment.id,
        p_provider_hash: verification.data.hash,
        p_verified_amount: paidAmount,
        p_verified_currency: verification.data.currency,
        p_verified_account_id: verification.data.toAccountId,
        p_expected_account_id: merchant.accountId,
        p_provider_paid_at: new Date(paidAt).toISOString(),
      },
    );

    if (completionError) throw completionError;

    const { data: completedPayment, error: completedError } = await supabase
      .from("payment_transactions")
      .select(
        "id, creator_id, donor_name, amount, currency, message, provider, provider_md5, tran_id, donation_id, status, expires_at, created_at, provider_hash",
      )
      .eq("id", payment.id)
      .single();

    if (completedError) throw completedError;
    return await paymentResult(supabase, completedPayment);
  } catch {
    return json(
      { error: "Payment verification is temporarily unavailable." },
      503,
    );
  }
}

async function paymentResult(
  supabase: ReturnType<typeof createAdminClient>,
  payment: {
    id: string;
    status: string;
    creator_id: string;
    donor_name: string;
    amount: number;
    currency: string;
    message: string | null;
    provider_md5: string;
    provider?: string;
    tran_id?: string | null;
    donation_id?: string | null;
    provider_hash: string | null;
    expires_at: string;
    created_at: string;
  },
) {
  if (payment.status !== "successful" && payment.status !== "completed") {
    return json({ status: payment.status });
  }

  const { data: tip, error } = await supabase
    .from("tips")
    .select(
      "id, creator_id, tipper_name, amount, currency, message, payment_method, payment_status, played_in_overlay, created_at",
    )
    .eq("payment_transaction_id", payment.id)
    .single();

  if (error) throw error;
  return json({ status: "successful", donation: tip });
}

function parseAbaDate(value: string | null) {
  if (!value) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value.replace(" ", "T")}+07:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
