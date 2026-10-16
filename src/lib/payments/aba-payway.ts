import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type AbaCurrency = "USD" | "KHR";

export type AbaQrResult = {
  qrString: string;
  qrImage: string;
  deeplink: string;
  tranId: string;
  expiresAt: string;
};

export type AbaTransactionStatus = {
  paymentStatus: string;
  paymentStatusCode: number;
  paymentAmount: number;
  paymentCurrency: string;
  transactionDate: string | null;
  providerTransactionId: string | null;
};

export type AbaConfig = {
  merchantId: string;
  apiKey: string;
  secretKey: string;
  baseUrl: string;
};

// In-memory merchant credentials loaded from Supabase (Dashboard -> Payment
// Providers). Takes precedence over environment variables and applies
// immediately without a server restart.
let overrideConfig: AbaConfig | null = null;
let loadedFromDb = false;

export function setAbaMerchantConfigOverride(config: AbaConfig | null) {
  overrideConfig = config;
  loadedFromDb = true;
}

export async function loadAbaMerchantConfig(
  supabase: ReturnType<typeof createAdminClient> | null,
): Promise<void> {
  if (loadedFromDb || !supabase) return;
  loadedFromDb = true;

  const { data, error } = await supabase
    .from("payment_merchant_credentials")
    .select("env, merchant_id, api_key, secret_key")
    .eq("provider", "aba_payway")
    .maybeSingle();

  if (error || !data) return;
  const row = data as {
    env?: string | null;
    merchant_id?: string | null;
    api_key?: string | null;
    secret_key?: string | null;
  };
  if (
    typeof row.merchant_id !== "string" ||
    !row.merchant_id.trim() ||
    typeof row.api_key !== "string" ||
    !row.api_key.trim() ||
    typeof row.secret_key !== "string" ||
    !row.secret_key.trim()
  ) {
    return;
  }

  overrideConfig = {
    merchantId: row.merchant_id.trim(),
    apiKey: row.api_key.trim(),
    secretKey: row.secret_key.trim(),
    baseUrl:
      row.env === "production"
        ? "https://checkout.payway.com.kh"
        : "https://checkout-sandbox.payway.com.kh",
  };
}

/**
 * PayWay hands out an "API Url" that sometimes points at a specific endpoint
 * (e.g. ".../payments/purchase"). generate-qr needs the host root, because
 * the endpoint path is appended here -- so strip any known API path off.
 */
function normalizeAbaBaseUrl(raw: string) {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/payment-gateway\/v1\/payments(\/.*)?$/i, "")
    .replace(/\/api\/payment-gateway\/v1$/i, "")
    .replace(/\/+$/, "");
}

function readAbaConfig(prefix: string): AbaConfig | null {
  const merchantId = process.env[`${prefix}_MERCHANT_ID`]?.trim();
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim();
  const secretKey = process.env[`${prefix}_SECRET_KEY`]?.trim();
  const explicitBaseUrl = process.env[`${prefix}_API_URL`]?.trim();

  if (!merchantId || !apiKey || !secretKey) return null;

  return {
    merchantId,
    apiKey,
    secretKey,
    baseUrl: explicitBaseUrl
      ? normalizeAbaBaseUrl(explicitBaseUrl)
      : process.env.ABA_PAYWAY_ENV === "production"
        ? "https://checkout.payway.com.kh"
        : "https://checkout-sandbox.payway.com.kh",
  };
}

function getEnvAbaConfig(): AbaConfig | null {
  return readAbaConfig("ABA_PAYWAY");
}

function getAbaConfig(): AbaConfig | null {
  return overrideConfig ?? getEnvAbaConfig();
}

function requestTime() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function sign(value: string, key: string) {
  return createHmac("sha512", key).update(value).digest("base64");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isAbaPaywayConfigured(configOverride?: AbaConfig | null) {
  return (configOverride ?? getAbaConfig()) !== null;
}

/**
 * A creator can run separate PayWay outlets per currency (a USD outlet and a
 * KHR outlet), each with its own merchant id and keys. Anything falling back
 * to the shared ABA_PAYWAY_* values, so a single-merchant setup still works
 * unchanged.
 */
export function getAbaConfigForCurrency(currency: AbaCurrency): AbaConfig | null {
  return readAbaConfig(`ABA_PAYWAY_${currency}`) ?? getAbaConfig();
}

export function isAbaConfiguredForCurrency(currency: AbaCurrency) {
  return getAbaConfigForCurrency(currency) !== null;
}

export function createAbaTransactionId() {
  return `${Date.now()}${cryptoRandomDigits(6)}`;
}

function cryptoRandomDigits(length: number) {
  return Array.from({ length }, () => randomInt(0, 10)).join("");
}

/**
 * Validates ABA merchant credentials against the live sandbox by requesting a
 * real (but never-charged) KHQR. A non-zero API response means the credentials
 * are wrong or the account is not authorized.
 */
export async function probeAbaMerchant(
  config: AbaConfig,
  callbackUrl: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await createAbaQr(
      {
        amount: 0.01,
        currency: "USD",
        tranId: `SKPROBE${Date.now()}`,
        donorName: "Kit Steam Sandbox Test",
        callbackUrl,
      },
      config,
    );
    return { ok: true, message: "Sandbox connected — test KHQR generated." };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Could not reach the ABA PayWay sandbox.",
    };
  }
}

export async function createAbaQr(
  input: {
    amount: number;
    currency: AbaCurrency;
    tranId: string;
    donorName: string;
    callbackUrl: string;
  },
  configOverride?: AbaConfig | null,
) {
  const config = configOverride ?? getAbaConfigForCurrency(input.currency);
  if (!config) throw new Error("ABA PayWay is not configured.");

  const [rawFirstName = "", ...lastNameParts] = input.donorName
    .trim()
    .split(/\s+/);
  const firstName = rawFirstName.replace(/[^a-zA-Z]/g, "").slice(0, 20) || "Supporter";
  const lastName = lastNameParts
    .join("")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 20);
  const fields: Record<string, string | number> = {
    req_time: requestTime(),
    merchant_id: config.merchantId,
    tran_id: input.tranId,
    first_name: firstName,
    last_name: lastName,
    email: "",
    phone: "",
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency,
    purchase_type: "purchase",
    payment_option: "abapay_khqr",
    items: "",
    callback_url: Buffer.from(input.callbackUrl).toString("base64"),
    return_deeplink: "",
    custom_fields: "",
    return_params: JSON.stringify({ tran_id: input.tranId }),
    payout: "",
    lifetime: 5,
    qr_image_template: "template3_color",
  };

  const signatureFields = [
    "req_time",
    "merchant_id",
    "tran_id",
    "amount",
    "items",
    "first_name",
    "last_name",
    "email",
    "phone",
    "purchase_type",
    "payment_option",
    "callback_url",
    "return_deeplink",
    "currency",
    "custom_fields",
    "return_params",
    "payout",
    "lifetime",
    "qr_image_template",
  ];
  const signatureInput = signatureFields
    .map((field) => String(fields[field] ?? ""))
    .join("");

  // ABA rejects requests that carry unused fields as empty strings rather than
  // leaving the key out, and treats that as a hash mismatch. The signature
  // still covers them (absent == empty in the hash input above), we just stop
  // putting empty placeholders on the wire.
  const payload: Record<string, string | number> = { ...fields };
  for (const optional of [
    "items",
    "email",
    "phone",
    "return_deeplink",
    "custom_fields",
    "return_params",
    "payout",
  ]) {
    if (payload[optional] === "") delete payload[optional];
  }

  const response = await fetch(
    `${config.baseUrl}/api/payment-gateway/v1/payments/generate-qr`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        hash: sign(signatureInput, config.apiKey),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `ABA PayWay rejected the request (HTTP ${response.status})${
        body ? `: ${body.slice(0, 300)}` : ""
      }`,
    );
  }
  const result = (await response.json()) as {
    qrString?: unknown;
    qrImage?: unknown;
    abapay_deeplink?: unknown;
    status?: { code?: string; message?: string };
  };

  if (
    result.status?.code !== "0" ||
    typeof result.qrString !== "string" ||
    typeof result.qrImage !== "string" ||
    typeof result.abapay_deeplink !== "string"
  ) {
    throw new Error(
      `ABA PayWay rejected the QR request (code ${
        result.status?.code ?? "?"
      }): ${result.status?.message ?? "no message returned"}`,
    );
  }

  return {
    qrString: result.qrString,
    qrImage: result.qrImage,
    deeplink: result.abapay_deeplink,
    tranId: input.tranId,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  } satisfies AbaQrResult;
}

export async function verifyAbaCallback(
  request: Request,
  configOverride?: AbaConfig | null,
) {
  const rawBody = await request.clone().text();
  const signature = request.headers.get("x-payway-hmac-sha512") ?? "";
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { valid: false as const, payload: null };
  }

  // Verify against the outlet that took the payment, which is the one
  // matching the currency when merchants are split per currency.
  const rawCurrency = String(payload?.payment_currency ?? "").toUpperCase();
  const config =
    configOverride ??
    (rawCurrency === "KHR" || rawCurrency === "USD"
      ? getAbaConfigForCurrency(rawCurrency)
      : getAbaConfig());
  if (!config) throw new Error("ABA PayWay is not configured.");

  const signingInput = Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      return typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value ?? "");
    })
    .join("");

  return {
    valid: Boolean(signature) && constantTimeEqual(sign(signingInput, config.secretKey), signature),
    payload,
  };
}

export async function checkAbaTransaction(
  tranId: string,
  configOverride?: AbaConfig | null,
  currency?: AbaCurrency,
): Promise<AbaTransactionStatus> {
  // Ask the same outlet that issued the QR, otherwise a per-currency
  // merchant would not recognise its own transaction.
  const config =
    configOverride ??
    (currency ? getAbaConfigForCurrency(currency) : getAbaConfig());
  if (!config) throw new Error("ABA PayWay is not configured.");

  const reqTime = requestTime();
  const fields = {
    req_time: reqTime,
    merchant_id: config.merchantId,
    tran_id: tranId,
  };
  const response = await fetch(
    `${config.baseUrl}/api/payment-gateway/v1/payments/check-transaction-2`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        hash: sign(`${reqTime}${config.merchantId}${tranId}`, config.apiKey),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) throw new Error("ABA PayWay status check failed.");
  const result = (await response.json()) as {
    data?: {
      payment_status?: string;
      payment_status_code?: number;
      payment_amount?: number | string;
      payment_currency?: string;
      transaction_date?: string;
      apv?: string;
    };
    status?: { code?: string; message?: string };
  };

  if (result.status?.code !== "00" || !result.data) {
    throw new Error(result.status?.message || "ABA PayWay returned no transaction.");
  }

  return {
    paymentStatus: result.data.payment_status ?? "PENDING",
    paymentStatusCode: Number(result.data.payment_status_code),
    paymentAmount: Number(result.data.payment_amount),
    paymentCurrency: result.data.payment_currency ?? "",
    transactionDate: result.data.transaction_date ?? null,
    providerTransactionId: result.data.apv ?? null,
  };
}
