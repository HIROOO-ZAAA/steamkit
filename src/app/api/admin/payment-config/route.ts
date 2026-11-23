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
import { requirePlatformAdmin, auditLog, getClientIp, getUserAgent, unauthorizedResponse } from "@/lib/auth/requirePlatformRole";

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
  auth: { userId: string; platformRole: string },
  request: Request
) {
  // Capture before state for audit log
  const { data: beforeData } = await supabase
    .from("payment_merchant_credentials")
    .select("*")
    .eq("provider", "bakong")
    .maybeSingle();

  const before = beforeData ? {
    provider: beforeData.provider,
    env: beforeData.env,
    accountId: beforeData.merchant_id,
    merchantName: beforeData.merchant_name || "",
    merchantCity: beforeData.merchant_city || "",
    tokenSet: Boolean(beforeData.api_key),
    status: beforeData.status,
    validatedAt: beforeData.validated_at ?? null,
  } : null;

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

  // Capture after state for audit log
  const { data: afterData } = await supabase
    .from("payment_merchant_credentials")
    .select("*")
    .eq("provider", "bakong")
    .maybeSingle();

  const after = afterData ? {
    provider: afterData.provider,
    env: afterData.env,
    accountId: afterData.merchant_id,
    merchantName: afterData.merchant_name || "",
    merchantCity: afterData.merchant_city || "",
    tokenSet: Boolean(afterData.api_key),
    status: afterData.status,
    validatedAt: afterData.validated_at ?? null,
  } : null;

  // Audit log the update
  await auditLog(supabase, {
    actorId: auth.userId,
    actorRole: auth.platformRole,
    action: "update",
    resourceType: "payment_config",
    resourceId: "bakong",
    before,
    after,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return json({ saved: true, provider: "bakong", status, detail });
}

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return unauthorizedResponse();
  }

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

  // Audit log the read action
  const adminClient = createAdminClient();
  await auditLog(adminClient, {
    actorId: auth.userId,
    actorRole: auth.platformRole,
    action: "view",
    resourceType: "payment_config",
    resourceId: "global",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

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
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return unauthorizedResponse();
  }

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

  // Capture before state for audit log
  const { data: beforeData } = await supabase
    .from("payment_merchant_credentials")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();

  let result: Response;

  if (provider === "bakong") {
    result = await saveBakongConfig(supabase, input, env, auth, request);
  } else {
    // ABA PayWay path - extract before state
    const before = beforeData ? {
      provider: beforeData.provider,
      env: beforeData.env,
      merchantIdLast4: last4(beforeData.merchant_id),
      apiKeyLast4: last4(beforeData.api_key),
      secretSet: Boolean(beforeData.secret_key),
      callbackUrl: beforeData.callback_url || "",
      status: beforeData.status,
      validatedAt: beforeData.validated_at ?? null,
    } : null;

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

    // Capture after state for audit log
    const { data: afterData } = await supabase
      .from("payment_merchant_credentials")
      .select("*")
      .eq("provider", "aba_payway")
      .maybeSingle();

    const after = afterData ? {
      provider: afterData.provider,
      env: afterData.env,
      merchantIdLast4: last4(afterData.merchant_id),
      apiKeyLast4: last4(afterData.api_key),
      secretSet: Boolean(afterData.secret_key),
      callbackUrl: afterData.callback_url || "",
      status: afterData.status,
      validatedAt: afterData.validated_at ?? null,
    } : null;

    // Audit log the update
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "update",
      resourceType: "payment_config",
      resourceId: "aba_payway",
      before,
      after,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      saved: true,
      status,
      detail: probe.message,
      merchantIdLast4: last4(merchantId),
      apiKeyLast4: last4(apiKey),
    });
  }

  // For Bakong path, we need to capture before/after and audit log
  // But saveBakongConfig returns a Response directly, so we need to refactor
  // For now, we'll add audit logging inside saveBakongConfig
  return result;
}