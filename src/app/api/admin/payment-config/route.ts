import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBakongConfig,
  getBakongMerchant,
  probeBakongMerchant,
  setBakongMerchantOverride,
  type BakongApiConfig,
} from "@/lib/payments/bakong";
import {
  isAbaPaywayConfigured,
  probeAbaMerchant,
  setAbaMerchantConfigOverride,
  type AbaConfig,
} from "@/lib/payments/aba-payway";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function last4(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v.slice(-4) : "";
}

/**
 * Global merchant credentials are shared by every creator, so only an
 * administrator may read or change them. The role check runs through the
 * session client (profiles are publicly readable) and fails closed: a missing
 * role column or a failed lookup is treated as "not an admin", never as a pass.
 */
async function requireAdmin() {
  const userClient = await createServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return {
      response: json({ error: "Sign in to manage payment credentials." }, 401),
    };
  }

  const { data: profile, error } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    return {
      response: json(
        { error: "Admin access is required to manage payment credentials." },
        403,
      ),
    };
  }

  return { response: null };
}

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Bakong needs only a merchant account (id, name, city) to generate scannable
 * KHQR codes. The API token is optional and only enables automatic payment
 * confirmation, so a missing token is saved as "QR only" rather than an error.
 */
async function saveBakongConfig(
  supabase: AdminSupabase,
  input: Record<string, unknown>,
  env: "sandbox" | "production",
) {
  const accountId =
    typeof input.accountId === "string" ? input.accountId.trim() : "";
  const merchantName =
    typeof input.merchantName === "string" ? input.merchantName.trim() : "";
  const merchantCity =
    typeof input.merchantCity === "string" ? input.merchantCity.trim() : "";
  const apiToken =
    typeof input.apiToken === "string" ? input.apiToken.trim() : "";

  if (!accountId || !merchantName) {
    return json(
      { error: "Bakong Account ID and Merchant Name are required." },
      400,
    );
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(accountId)) {
    return json(
      { error: "That does not look like a Bakong account ID (name@aclb)." },
      400,
    );
  }
  if (accountId.length > 80 || merchantName.length > 80 || apiToken.length > 512) {
    return json({ error: "One of the credential fields is too long." }, 400);
  }

  const { error: upsertError } = await supabase
    .from("payment_merchant_credentials")
    .upsert(
      {
        provider: "bakong",
        env,
        merchant_id: accountId,
        merchant_name: merchantName,
        merchant_city: merchantCity || "PHNOM PENH",
        api_key: apiToken,
        secret_key: "",
        status: "unconfigured",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  if (upsertError) return json({ error: upsertError.message }, 500);

  const merchant = {
    accountId,
    accountName: merchantName,
    city: merchantCity || "PHNOM PENH",
  };
  const apiUrl =
    env === "production"
      ? "https://api-bakong.nbc.gov.kh"
      : "https://api-bakong.sandbox.nbc.gov.kh";

  let status = "ok";
  let detail = "QR generation ready. Add an API token to confirm payments automatically.";
  if (apiToken) {
    const probe = await probeBakongMerchant({
      ...merchant,
      apiToken,
      apiUrl,
    } as BakongApiConfig);
    status = probe.ok ? "ok" : "failed";
    detail = probe.message;
  }

  const { error: statusError } = await supabase
    .from("payment_merchant_credentials")
    .update({
      status,
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "bakong");
  if (statusError) return json({ error: statusError.message }, 500);

  // Apply immediately: the next checkout uses these credentials.
  setBakongMerchantOverride(merchant, apiToken, apiUrl);

  return json({ saved: true, provider: "bakong", status, detail });
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const serviceRoleReady = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );

  let stored: Record<string, unknown> | null = null;
  let storedBakong: Record<string, unknown> | null = null;
  if (serviceRoleReady) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("payment_merchant_credentials")
        .select("*")
        .eq("provider", "aba_payway")
        .maybeSingle();
      stored = (data ?? null) as Record<string, unknown> | null;

      const { data: bakongRow } = await supabase
        .from("payment_merchant_credentials")
        .select("*")
        .eq("provider", "bakong")
        .maybeSingle();
      storedBakong = (bakongRow ?? null) as Record<string, unknown> | null;
    } catch {
      /* service role may be non-functional */
    }
  }

  return json({
    serviceRoleReady,
    providerEnv: process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "bakong",
    env: {
      abaConfigured: isAbaPaywayConfigured(),
      bakongConfigured: Boolean(getBakongConfig()),
      bakongMerchantReady: Boolean(getBakongMerchant()),
      abaCallbackUrl: process.env.ABA_PAYWAY_CALLBACK_URL || "",
    },
    stored: stored
      ? {
          provider: stored.provider,
          env: stored.env,
          merchantIdLast4: last4(stored.merchant_id),
          apiKeyLast4: last4(stored.api_key),
          secretSet: Boolean(stored.secret_key),
          callbackUrl: stored.callback_url || "",
          status: stored.status,
          validatedAt: stored.validated_at ?? null,
        }
      : null,
    storedBakong: storedBakong
      ? {
          env: storedBakong.env,
          accountId: storedBakong.merchant_id,
          merchantName: storedBakong.merchant_name || "",
          merchantCity: storedBakong.merchant_city || "",
          tokenSet: Boolean(storedBakong.api_key),
          status: storedBakong.status,
          validatedAt: storedBakong.validated_at ?? null,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const serviceRoleReady = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  if (!serviceRoleReady) {
    return json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is missing in .env.local. Add it, restart the app, then save again.",
      },
      400,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const provider =
    input.provider === "bakong" ? "bakong" : "aba_payway";
  const env = input.env === "production" ? "production" : "sandbox";

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return json(
      { error: "Server payment service is not configured." },
      503,
    );
  }

  if (provider === "bakong") {
    return saveBakongConfig(supabase, input, env);
  }

  const merchantId =
    typeof input.merchantId === "string" ? input.merchantId.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const secretKey =
    typeof input.secretKey === "string" ? input.secretKey.trim() : "";
  const callbackUrl =
    typeof input.callbackUrl === "string" ? input.callbackUrl.trim() : "";

  if (!merchantId || !apiKey || !secretKey) {
    return json(
      { error: "Merchant ID, API Key and Secret Key are required." },
      400,
    );
  }
  if (merchantId.length > 40 || apiKey.length > 128 || secretKey.length > 128) {
    return json({ error: "One of the credential fields is too long." }, 400);
  }
  if (callbackUrl && !/^https?:\/\/\S+$/.test(callbackUrl)) {
    return json({ error: "Callback URL does not look valid." }, 400);
  }

  const { error: upsertError } = await supabase
    .from("payment_merchant_credentials")
    .upsert(
      {
        provider: "aba_payway",
        env,
        merchant_id: merchantId,
        api_key: apiKey,
        secret_key: secretKey,
        callback_url: callbackUrl || null,
        status: "unconfigured",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  if (upsertError) return json({ error: upsertError.message }, 500);

  const config: AbaConfig = {
    merchantId,
    apiKey,
    secretKey,
    baseUrl:
      env === "production"
        ? "https://checkout.payway.com.kh"
        : "https://checkout-sandbox.payway.com.kh",
  };
  const probe = await probeAbaMerchant(config, callbackUrl);
  const status = probe.ok ? "ok" : "failed";

  const { error: statusError } = await supabase
    .from("payment_merchant_credentials")
    .update({
      status,
      validated_at: probe.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "aba_payway");
  if (statusError) return json({ error: statusError.message }, 500);

  // Apply immediately: the very next checkout uses these credentials.
  setAbaMerchantConfigOverride(config);

  return json({
    saved: true,
    status,
    detail: probe.message,
    merchantIdLast4: last4(merchantId),
    apiKeyLast4: last4(apiKey),
  });
}