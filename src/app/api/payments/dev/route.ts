import { NextRequest } from "next/server";

import { createConfiguredPaymentProvider } from "@/lib/payments/payment-provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { error: "Developer-only simulation is disabled outside development." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const provider = createConfiguredPaymentProvider();
  if (provider.name !== "placeholder") {
    return Response.json(
      { error: "This debug route only works with the placeholder provider." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      amount?: number;
      currency?: "USD" | "KHR";
      creatorId?: string;
    };

    const action = body.action ?? "simulate-success";
    const eventStatus =
      action === "simulate-failed"
        ? "failed"
        : action === "simulate-cancelled"
          ? "cancelled"
          : action === "simulate-refunded"
            ? "refunded"
            : "completed";

    const payment = await provider.createPayment({
      creatorId: body.creatorId ?? "dev-creator",
      amount: Number(body.amount ?? 10),
      currency: body.currency ?? "USD",
      donorName: "Developer Test",
      idempotencyKey: `dev-${Date.now()}`,
    });

    const webhookResult = await provider.handleWebhook({
      type: "payment.updated",
      provider: provider.name,
      providerTransactionId: payment.providerTransactionId,
      amount: payment.metadata?.amount
        ? Number(payment.metadata.amount)
        : Number(payment.metadata?.amount ?? 10),
      currency: body.currency ?? "USD",
      status: eventStatus,
      metadata: { debug: true },
      createdAt: new Date().toISOString(),
    });

    return Response.json(
      {
        ok: webhookResult.accepted,
        action,
        provider: provider.name,
        providerTransactionId: payment.providerTransactionId,
        status: eventStatus,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Developer simulation failed.";

    return Response.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
