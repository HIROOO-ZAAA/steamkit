export type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentProviderName =
  | "placeholder"
  | "bakong"
  | "aba_payway"
  | "custom";

export interface CreatePaymentInput {
  creatorId: string;
  donorName?: string;
  amount: number;
  currency: "USD" | "KHR";
  message?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreatePaymentResult {
  provider: PaymentProviderName;
  providerTransactionId: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentStatusResult {
  provider: PaymentProviderName;
  providerTransactionId: string;
  status: PaymentStatus;
  amount?: number;
  currency?: "USD" | "KHR";
  metadata?: Record<string, unknown>;
}

export interface VerifiedWebhookEvent {
  type: string;
  provider: PaymentProviderName;
  providerTransactionId: string;
  amount?: number;
  currency?: "USD" | "KHR";
  status: PaymentStatus;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface WebhookVerificationResult {
  ok: boolean;
  reason?: string;
  event?: VerifiedWebhookEvent;
}

export interface WebhookResult {
  accepted: boolean;
  reason?: string;
  providerTransactionId?: string;
}

export interface RefundResult {
  ok: boolean;
  providerTransactionId: string;
  status: PaymentStatus;
  reason?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResult>;
  verifyWebhook(request: Request): Promise<WebhookVerificationResult>;
  handleWebhook(event: VerifiedWebhookEvent): Promise<WebhookResult>;
  refundPayment?(
    providerTransactionId: string,
    amount?: number,
  ): Promise<RefundResult>;
}
