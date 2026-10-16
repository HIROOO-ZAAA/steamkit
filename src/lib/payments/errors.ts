export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export class PaymentNotFoundError extends Error {
  constructor(message = "Payment transaction was not found.") {
    super(message);
    this.name = "PaymentNotFoundError";
  }
}

export class DuplicatePaymentError extends Error {
  constructor(message = "Duplicate payment request detected.") {
    super(message);
    this.name = "DuplicatePaymentError";
  }
}
