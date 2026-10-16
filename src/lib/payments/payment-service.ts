import { createConfiguredPaymentProvider } from "@/lib/payments/payment-provider";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  RefundResult,
  VerifiedWebhookEvent,
  WebhookResult,
  WebhookVerificationResult,
} from "@/lib/payments/types";

export class PaymentService {
  constructor(
    private readonly provider: PaymentProvider = createConfiguredPaymentProvider(),
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return this.provider.createPayment(input);
  }

  async getPaymentStatus(
    providerTransactionId: string,
  ): Promise<PaymentStatusResult> {
    return this.provider.getPaymentStatus(providerTransactionId);
  }

  async verifyWebhook(request: Request): Promise<WebhookVerificationResult> {
    return this.provider.verifyWebhook(request);
  }

  async handleWebhook(event: VerifiedWebhookEvent): Promise<WebhookResult> {
    return this.provider.handleWebhook(event);
  }

  async refundPayment(
    providerTransactionId: string,
    amount?: number,
  ): Promise<RefundResult> {
    const refund = this.provider.refundPayment;
    if (!refund) {
      return {
        ok: false,
        providerTransactionId,
        status: "failed",
        reason: "This payment provider does not support refunds.",
      };
    }

    return refund.call(this.provider, providerTransactionId, amount);
  }
}

export const paymentService = new PaymentService();
