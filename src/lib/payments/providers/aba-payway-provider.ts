import "server-only";

import {
  checkAbaTransaction,
  createAbaQr,
  createAbaTransactionId,
  normalizeAbaPaymentStatus,
  verifyAbaCallback,
} from "@/lib/payments/aba-payway";
import type { AbaPaymentStatus } from "@/lib/payments/aba-payway";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatus,
  PaymentStatusResult,
  VerifiedWebhookEvent,
  WebhookResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";

export class AbaPaywayProvider implements PaymentProvider {
  readonly name = "aba_payway" as const;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!input.creatorId || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("A valid creator and positive payment amount are required.");
    }

    const tranId = createAbaTransactionId();
    const callbackUrl =
      process.env.ABA_PAYWAY_CALLBACK_URL ||
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/payments/webhook`;
    const qr = await createAbaQr({
      amount: input.amount,
      currency: input.currency,
      tranId,
      donorName: input.donorName || "Anonymous",
      callbackUrl,
    });

    return {
      provider: this.name,
      providerTransactionId: tranId,
      status: "processing",
      checkoutUrl: qr.deeplink,
      metadata: {
        ...input.metadata,
        qrString: qr.qrString,
        qrImage: qr.qrImage,
        deeplink: qr.deeplink,
        expiresAt: qr.expiresAt,
      },
    };
  }

  async getPaymentStatus(
    providerTransactionId: string,
  ): Promise<PaymentStatusResult> {
    const checked = await checkAbaTransaction(providerTransactionId);
    return {
      provider: this.name,
      providerTransactionId,
      status: mapStatus(checked.paymentStatus),
      amount: checked.paymentAmount,
      currency:
        checked.paymentCurrency === "KHR" || checked.paymentCurrency === "USD"
          ? checked.paymentCurrency
          : undefined,
      metadata: {
        paymentStatusCode: checked.paymentStatusCode,
        transactionDate: checked.transactionDate,
      },
    };
  }

  async verifyWebhook(request: Request): Promise<WebhookVerificationResult> {
    try {
      const result = await verifyAbaCallback(request);
      const payload = result.payload;
      const tranId = payload?.tran_id;
      if (!result.valid || !payload || typeof tranId !== "string") {
        return { ok: false, reason: "Invalid ABA PayWay callback signature." };
      }

      let callbackStatus: AbaPaymentStatus;
      try {
        callbackStatus = normalizeAbaPaymentStatus(payload.status);
      } catch {
        return {
          ok: false,
          reason: "Unknown ABA PayWay callback status.",
        };
      }

      const event: VerifiedWebhookEvent = {
        type: "payment.updated",
        provider: this.name,
        providerTransactionId: tranId,
        amount: Number(payload.payment_amount) || undefined,
        currency:
          payload.payment_currency === "USD" || payload.payment_currency === "KHR"
            ? payload.payment_currency
            : undefined,
        status: mapStatus(callbackStatus),
        metadata: payload,
        createdAt: new Date().toISOString(),
      };
      return { ok: true, event };
    } catch {
      return { ok: false, reason: "ABA PayWay is not configured." };
    }
  }

  async handleWebhook(event: VerifiedWebhookEvent): Promise<WebhookResult> {
    return {
      accepted: Boolean(event.providerTransactionId),
      reason: event.providerTransactionId ? undefined : "Missing transaction id.",
      providerTransactionId: event.providerTransactionId,
    };
  }
}

function mapStatus(status: AbaPaymentStatus): PaymentStatus {
  switch (status) {
    case "APPROVED":
      return "completed";
    case "PENDING":
      return "pending";
    case "CANCELLED":
      return "cancelled";
    case "DECLINED":
      return "failed";
    case "REFUNDED":
      return "refunded";
  }
}
