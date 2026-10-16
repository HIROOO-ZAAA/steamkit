import { createHmac } from "node:crypto";

import {
  DuplicatePaymentError,
  PaymentProviderError,
} from "@/lib/payments/errors";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatus,
  PaymentStatusResult,
  RefundResult,
  VerifiedWebhookEvent,
  WebhookResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";

const simulatedTransactions = new Map<string, PaymentStatusResult>();

function getWebhookSecret() {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "placeholder-dev-webhook-secret";
}

export class PlaceholderPaymentProvider implements PaymentProvider {
  readonly name = "placeholder" as const;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (process.env.NODE_ENV === "production") {
      throw new PaymentProviderError(
        "The placeholder payment provider is disabled in production.",
      );
    }

    if (!input.creatorId) {
      throw new PaymentProviderError(
        "A creatorId is required to create a payment.",
      );
    }

    const providerTransactionId =
      input.idempotencyKey ?? `placeholder_${Date.now()}`;
    const initialStatus: PaymentStatus = "pending";

    const result: PaymentStatusResult = {
      provider: this.name,
      providerTransactionId,
      status: initialStatus,
      amount: input.amount,
      currency: input.currency,
      metadata: {
        creatorId: input.creatorId,
        donorName: input.donorName ?? "Anonymous",
        message: input.message ?? null,
      },
    };

    simulatedTransactions.set(providerTransactionId, result);

    return {
      provider: this.name,
      providerTransactionId,
      status: initialStatus,
      checkoutUrl: `/api/payments/dev?status=pending&transaction=${providerTransactionId}`,
      metadata: result.metadata,
    };
  }

  async getPaymentStatus(
    providerTransactionId: string,
  ): Promise<PaymentStatusResult> {
    const transaction = simulatedTransactions.get(providerTransactionId);

    if (!transaction) {
      return {
        provider: this.name,
        providerTransactionId,
        status: "failed",
      };
    }

    return transaction;
  }

  async verifyWebhook(request: Request): Promise<WebhookVerificationResult> {
    let rawBody = "";
    try {
      rawBody = await request.clone().text();
    } catch {
      return { ok: false, reason: "Unable to read the webhook payload." };
    }

    if (!rawBody) {
      return { ok: false, reason: "Empty webhook payload." };
    }

    const hasHeader = request.headers.get("x-payment-signature") !== null;
    if (!hasHeader) {
      return { ok: false, reason: "Missing webhook signature header." };
    }

    const signature = request.headers.get("x-payment-signature") ?? "";
    const expected = createHmac("sha256", getWebhookSecret())
      .update(rawBody)
      .digest("hex");

    if (signature !== expected) {
      return { ok: false, reason: "Webhook signature verification failed." };
    }

    try {
      const payload = JSON.parse(rawBody) as Partial<VerifiedWebhookEvent>;
      const providerTransactionId = payload.providerTransactionId;
      const status = payload.status;

      if (!providerTransactionId || !status) {
        return {
          ok: false,
          reason: "Malformed webhook payload: missing transaction or status.",
        };
      }

      return {
        ok: true,
        event: {
          type: payload.type ?? "payment.updated",
          provider: this.name,
          providerTransactionId,
          amount:
            typeof payload.amount === "number" ? payload.amount : undefined,
          currency: payload.currency,
          status: (status as PaymentStatus) ?? "pending",
          idempotencyKey: payload.idempotencyKey,
          metadata: payload.metadata,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        },
      };
    } catch {
      return { ok: false, reason: "Webhook payload was not valid JSON." };
    }
  }

  async handleWebhook(event: VerifiedWebhookEvent): Promise<WebhookResult> {
    if (!event.providerTransactionId) {
      return { accepted: false, reason: "Missing provider transaction id." };
    }

    const current = simulatedTransactions.get(event.providerTransactionId);
    if (current && event.status === current.status) {
      throw new DuplicatePaymentError(
        `Webhook duplicate detected for ${event.providerTransactionId}.`,
      );
    }

    const nextStatus = event.status;
    simulatedTransactions.set(event.providerTransactionId, {
      provider: this.name,
      providerTransactionId: event.providerTransactionId,
      status: nextStatus,
      amount: event.amount,
      currency: event.currency,
      metadata: {
        ...(current?.metadata ?? {}),
        ...(event.metadata ?? {}),
      },
    });

    return {
      accepted: true,
      providerTransactionId: event.providerTransactionId,
    };
  }

  async refundPayment(
    providerTransactionId: string,
    amount?: number,
  ): Promise<RefundResult> {
    const current = simulatedTransactions.get(providerTransactionId);

    if (!current) {
      return {
        ok: false,
        providerTransactionId,
        status: "failed",
        reason: "Transaction not found.",
      };
    }

    simulatedTransactions.set(providerTransactionId, {
      ...current,
      status: "refunded",
      amount: amount ?? current.amount,
    });

    return {
      ok: true,
      providerTransactionId,
      status: "refunded",
    };
  }
}
