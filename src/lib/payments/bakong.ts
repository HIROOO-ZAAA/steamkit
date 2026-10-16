import * as bakongPackage from "bakong-khqr";
import { createAdminClient } from "@/lib/supabase/admin";

type Currency = "USD" | "KHR";

interface DynamicKhqrOptions {
  paymentId: string;
  amount: number;
  currency: Currency;
  expiresAt: Date;
  /** Per-creator merchant identity (overrides the env-level config). */
  merchant?: BakongMerchant;
}

export interface BakongApiConfig {
  accountId: string;
  accountName: string;
  city: string;
  apiToken: string;
  apiUrl: string;
}

interface KhqrResult {
  status: { code: number; message: string | null };
  data: unknown;
}

interface BakongModule {
  BakongKHQR: {
    new (): {
      generateIndividual(info: unknown): KhqrResult;
    };
    verify(qr: string): { isValid: boolean };
  };
  IndividualInfo: new (
    accountId: string,
    accountName: string,
    city: string,
    options: Record<string, string | number>,
  ) => unknown;
  khqrData: { currency: { usd: number; khr: number } };
}

export interface BakongTransaction {
  hash: string;
  toAccountId: string;
  currency: string;
  amount: string | number;
  createdDateMs: string | number;
}

export interface BakongCheckResponse {
  responseCode: number;
  errorCode: number | null;
  data: BakongTransaction | null;
}

const sdk = bakongPackage as unknown as BakongModule;

export interface BakongMerchant {
  accountId: string;
  accountName: string;
  city: string;
}

// In-memory merchant credentials loaded from Supabase (Dashboard -> Payment
// Providers). Takes precedence over environment variables and applies
// immediately without a server restart.
let overrideMerchant: BakongMerchant | null = null;
let overrideToken = "";
let overrideApiUrl = "";
let loadedFromDb = false;

export function setBakongMerchantOverride(
  merchant: BakongMerchant | null,
  apiToken = "",
  apiUrl = "",
) {
  overrideMerchant = merchant;
  overrideToken = apiToken;
  overrideApiUrl = apiUrl;
  loadedFromDb = true;
}

export async function loadBakongMerchantConfig(
  supabase: ReturnType<typeof createAdminClient> | null,
): Promise<void> {
  if (loadedFromDb || !supabase) return;
  loadedFromDb = true;

  const { data, error } = await supabase
    .from("payment_merchant_credentials")
    .select("env, merchant_id, merchant_name, merchant_city, api_key")
    .eq("provider", "bakong")
    .maybeSingle();

  if (error || !data) return;
  const row = data as {
    env?: string | null;
    merchant_id?: string | null;
    merchant_name?: string | null;
    merchant_city?: string | null;
    api_key?: string | null;
  };
  if (
    typeof row.merchant_id !== "string" ||
    !row.merchant_id.trim() ||
    typeof row.merchant_name !== "string" ||
    !row.merchant_name.trim()
  ) {
    return;
  }

  overrideMerchant = {
    accountId: row.merchant_id.trim(),
    accountName: row.merchant_name.trim(),
    city: (row.merchant_city ?? "").trim() || "PHNOM PENH",
  };
  overrideToken = (row.api_key ?? "").trim();
  overrideApiUrl =
    row.env === "production"
      ? "https://api-bakong.nbc.gov.kh"
      : "https://api-bakong.sandbox.nbc.gov.kh";
}

/**
 * Merchant identity is everything the KHQR standard needs to *build* a QR
 * code, so a Bakong merchant account alone is enough to generate a scannable
 * payment QR. The API token is only required to *verify* that a payment
 * actually arrived (check_transaction_by_md5).
 */
export function getBakongMerchant(): BakongMerchant | null {
  if (overrideMerchant) return overrideMerchant;

  const accountId = process.env.BAKONG_ACCOUNT_ID;
  const accountName = process.env.BAKONG_MERCHANT_NAME;
  const city = process.env.BAKONG_MERCHANT_CITY;

  if (!accountId || !accountName || !city) return null;

  return { accountId, accountName, city };
}

export function getBakongConfig(): BakongApiConfig | null {
  const merchant = getBakongMerchant();
  const apiToken = overrideToken || process.env.BAKONG_API_TOKEN;

  if (!merchant || !apiToken) return null;

  return {
    ...merchant,
    apiToken,
    apiUrl:
      overrideApiUrl ||
      process.env.BAKONG_API_URL ||
      "https://api-bakong.nbc.gov.kh",
  };
}

export function generateDynamicKhqr({
  paymentId,
  amount,
  currency,
  expiresAt,
  merchant,
}: DynamicKhqrOptions) {
  const config = merchant ?? getBakongMerchant();
  if (!config) throw new Error("Bakong is not configured");

  const currencyCode =
    currency === "KHR" ? sdk.khqrData.currency.khr : sdk.khqrData.currency.usd;
  // Bakong caps the bill number at 25 characters. A full UUID hash runs to 26,
// which the SDK rejects with "Bill Name Length is invalid", so keep it short.
const billNumber = `SK${paymentId.replaceAll("-", "").slice(0, 22)}`;
  const info = new sdk.IndividualInfo(
    config.accountId,
    config.accountName,
    config.city,
    {
      currency: currencyCode,
      amount,
      billNumber,
      storeLabel: "Kit Steam",
      terminalLabel: "Web Tip",
      expirationTimestamp: expiresAt.getTime(),
      merchantCategoryCode: "5999",
    },
  );
  const generated = new sdk.BakongKHQR().generateIndividual(info);
  const data = generated.data as { qr?: unknown; md5?: unknown } | null;

  if (
    generated.status.code !== 0 ||
    typeof data?.qr !== "string" ||
    typeof data.md5 !== "string"
  ) {
    throw new Error("Bakong could not generate a valid KHQR");
  }

  if (!sdk.BakongKHQR.verify(data.qr).isValid) {
    throw new Error("Bakong generated an unreadable KHQR");
  }

  // Ship the SDK output untouched -- see the note above repairKhqr's removal.
  return {
    qrString: data.qr,
    md5: data.md5,
    recipientName: config.accountName,
  };
}

/**
 * bakong-khqr@1.0.7 is CORRECT and its output must be used verbatim.
 *
 * Earlier in this project its CRC and tag 54 were "repaired" on the belief that
 * the SDK was buggy. That was wrong. Re-checked against a freshly generated
 * ABA PayWay QR -- a known-good, scannable code -- PayWay computes the CRC over
 * the body INCLUDING the trailing "6304", which is exactly what the SDK does,
 * and writes tag 54 with a decimal point ("1.00"), which is also what the SDK
 * does. Both "fixes" were breaking a working generator.
 *
 * Do not re-add either repair. If a wallet rejects a KHQR, the cause is the
 * receiving account, not the payload -- see PROJECT_MEMORY.md.
 */

/**
 * Checks that the stored Bakong credentials actually work by asking the API
 * about a transaction that cannot exist. A structured answer (even "not
 * found") proves the token works; an auth failure or network error does not.
 */
export async function probeBakongMerchant(
  config: BakongApiConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await checkBakongTransaction("0".repeat(32), config);
    return {
      ok: true,
      message:
        result.responseCode === 0
          ? "Bakong accepted the credentials."
          : `Bakong accepted the credentials (responseCode ${result.responseCode}).`,
    };
  } catch {
    return {
      ok: false,
      message:
        "Bakong could not be reached, or the API token was rejected. QR codes still work — only automatic confirmation is affected.",
    };
  }
}

export async function checkBakongTransaction(
  md5: string,
  configOverride?: BakongApiConfig,
): Promise<BakongCheckResponse> {
  const config = configOverride ?? getBakongConfig();
  if (!config) throw new Error("Bakong is not configured");

  const response = await fetch(
    `${config.apiUrl.replace(/\/+$/, "")}/v1/check_transaction_by_md5`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ md5 }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) throw new Error("Bakong transaction verification failed");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") {
    throw new Error("Bakong returned an invalid verification response");
  }

  const body = result as Record<string, unknown>;
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : null;

  return {
    responseCode: Number(body.responseCode),
    errorCode: body.errorCode == null ? null : Number(body.errorCode),
    data:
      data &&
      typeof data.hash === "string" &&
      typeof data.toAccountId === "string" &&
      typeof data.currency === "string"
        ? {
            hash: data.hash,
            toAccountId: data.toAccountId,
            currency: data.currency,
            amount: data.amount as string | number,
            createdDateMs: data.createdDateMs as string | number,
          }
        : null,
  };
}
