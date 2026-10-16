import { randomUUID } from "node:crypto";

import {
  PaymentConfigurationError,
  PaymentProviderError,
} from "@/lib/payments/errors";
import { PlaceholderPaymentProvider } from "@/lib/payments/providers/placeholder-provider";
import { AbaPaywayProvider } from "@/lib/payments/providers/aba-payway-provider";
import type {
  PaymentProvider,
  PaymentProviderName,
} from "@/lib/payments/types";

export function getConfiguredProviderName(): PaymentProviderName {
  const providerName = (process.env.PAYMENT_PROVIDER ?? "placeholder")
    .trim()
    .toLowerCase();

  if (providerName === "placeholder") return "placeholder";
  if (providerName === "bakong") return "bakong";
  if (providerName === "aba_payway") return "aba_payway";

  return "custom";
}

export function assertProductionProviderSafety() {
  if (
    process.env.NODE_ENV === "production" &&
    getConfiguredProviderName() === "placeholder"
  ) {
    throw new PaymentConfigurationError(
      "Production builds cannot use the placeholder payment provider. Set PAYMENT_PROVIDER to a real provider.",
    );
  }
}

export function createConfiguredPaymentProvider(): PaymentProvider {
  assertProductionProviderSafety();

  const providerName = getConfiguredProviderName();

  switch (providerName) {
    case "placeholder":
      return new PlaceholderPaymentProvider();
    case "bakong":
      // Keep the legacy Bakong flow working through the existing route-level implementation.
      // The abstraction is intentionally provider-neutral so this can be swapped later.
      return new PlaceholderPaymentProvider();
    case "aba_payway":
      return new AbaPaywayProvider();
    case "custom":
    default:
      throw new PaymentProviderError(
        `Unsupported payment provider: ${providerName}. Add a provider implementation before enabling it.`,
      );
  }
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
