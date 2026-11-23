import { createAdminClient } from "@/lib/supabase/admin";
import {
  requirePlatformAdmin,
  auditLog,
  getClientIp,
  getUserAgent,
} from "@/lib/auth/requirePlatformRole";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

interface ConfigEntry {
  key: string;
  value: unknown;
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * GET /api/admin/config - Platform configuration
 * Requires platform_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();

    // Get environment config (non-sensitive)
    const envConfig = {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
      VOICESTUDIO_BASE_URL: process.env.VOICESTUDIO_BASE_URL,
      TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
      // Don't expose sensitive keys
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "***configured***" : "***missing***",
      ABA_PAYWAY_CALLBACK_URL: process.env.ABA_PAYWAY_CALLBACK_URL,
      ABA_PAYWAY_API_KEY: process.env.ABA_PAYWAY_API_KEY ? "***configured***" : "***missing***",
      ABA_PAYWAY_SECRET_KEY: process.env.ABA_PAYWAY_SECRET_KEY ? "***configured***" : "***missing***",
      ABA_PAYWAY_MERCHANT_ID: process.env.ABA_PAYWAY_MERCHANT_ID ? "***configured***" : "***missing***",
      BAKONG_API_TOKEN: process.env.BAKONG_API_TOKEN ? "***configured***" : "***missing***",
      BAKONG_MERCHANT_ID: process.env.BAKONG_MERCHANT_ID ? "***configured***" : "***missing***",
      BAKONG_MERCHANT_NAME: process.env.BAKONG_MERCHANT_NAME ? "***configured***" : "***missing***",
      BAKONG_MERCHANT_CITY: process.env.BAKONG_MERCHANT_CITY ? "***configured***" : "***missing***",
    };

    // Get database-stored config if any
    const { data: dbConfig } = await supabase
      .from("platform_config")
      .select("*")
      .order("key", { ascending: true });

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "config",
      resourceId: "platform",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      env: envConfig,
      database: dbConfig || [],
    });
  } catch (error) {
    console.error("Admin config get error:", error);
    return json({ error: "Failed to load configuration." }, 500);
  }
}

/**
 * POST /api/admin/config - Update platform configuration
 * Requires platform_admin or higher (super_admin for sensitive keys)
 */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const value = input.value;
  const description = typeof input.description === "string" ? input.description.trim() : undefined;

  if (!key) {
    return json({ error: "Config key is required." }, 400);
  }

  // Sensitive keys require super_admin
  const sensitiveKeys = ["service_role", "secret", "api_key", "token", "password", "webhook"];
  const isSensitive = sensitiveKeys.some(k => key.toLowerCase().includes(k));
  if (isSensitive && auth.platformRole !== "super_admin") {
    return json({ error: "Only super_admin can modify sensitive configuration." }, 403);
  }

  try {
    const supabase = createAdminClient();

    // Get current value for audit log
    const { data: current } = await supabase
      .from("platform_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    const { error } = await supabase
      .from("platform_config")
      .upsert({
        key,
        value,
        description,
        updated_at: new Date().toISOString(),
        updated_by: auth.userId,
      }, { onConflict: "key" });

    if (error) {
      return json({ error: "Failed to update configuration." }, 500);
    }

    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "update",
      resourceType: "config",
      resourceId: key,
      before: current?.value ?? null,
      after: value,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({ ok: true, key });
  } catch (error) {
    console.error("Admin config update error:", error);
    return json({ error: "Failed to update configuration." }, 500);
  }
}