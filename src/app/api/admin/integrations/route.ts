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

interface IntegrationStatus {
  name: string;
  status: "connected" | "disconnected" | "error" | "not_configured" | "configured";
  details?: Record<string, unknown>;
  lastSync?: string;
  error?: string;
}

/**
 * GET /api/admin/integrations - Platform integrations status
 * Requires platform_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();

    // Check VoiceStudio
    let voiceStudio: IntegrationStatus = { name: "VoiceStudio", status: "not_configured" };
    const voiceStudioUrl = process.env.VOICESTUDIO_BASE_URL;
    if (voiceStudioUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${voiceStudioUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        voiceStudio = {
          name: "VoiceStudio",
          status: resp.ok ? "connected" : "error",
          details: { url: voiceStudioUrl },
          error: resp.ok ? undefined : `HTTP ${resp.status}`,
        };
      } catch {
        voiceStudio = {
          name: "VoiceStudio",
          status: "error",
          details: { url: voiceStudioUrl },
          error: "Connection failed or timeout",
        };
      }
    }

    // Check Telegram Bridge
    let telegramBridge: IntegrationStatus = { name: "Telegram Bridge", status: "not_configured" };
    const bridgeUrl = process.env.TELEGRAM_BRIDGE_URL || "http://127.0.0.1:3113";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${bridgeUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      telegramBridge = {
        name: "Telegram Bridge",
        status: resp.ok ? "connected" : "error",
        details: { url: bridgeUrl },
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch {
      telegramBridge = {
        name: "Telegram Bridge",
        status: "error",
        details: { url: bridgeUrl },
        error: "Connection failed or timeout",
      };
    }

    // Check ABA PayWay
    let abaPayWay: IntegrationStatus = { name: "ABA PayWay", status: "not_configured" };
    if (process.env.ABA_PAYWAY_API_KEY && process.env.ABA_PAYWAY_SECRET_KEY && process.env.ABA_PAYWAY_MERCHANT_ID) {
      abaPayWay = {
        name: "ABA PayWay",
        status: "configured",
        details: {
          merchantId: process.env.ABA_PAYWAY_MERCHANT_ID,
          callbackUrl: process.env.ABA_PAYWAY_CALLBACK_URL,
          env: process.env.ABA_PAYWAY_ENV || "sandbox",
        },
      };
    }

    // Check Bakong
    let bakong: IntegrationStatus = { name: "Bakong KHQR", status: "not_configured" };
    if (process.env.BAKONG_API_TOKEN && process.env.BAKONG_MERCHANT_ID) {
      bakong = {
        name: "Bakong KHQR",
        status: "configured",
        details: {
          merchantId: process.env.BAKONG_MERCHANT_ID,
          merchantName: process.env.BAKONG_MERCHANT_NAME,
          merchantCity: process.env.BAKONG_MERCHANT_CITY,
          env: process.env.BAKONG_ENV || "sandbox",
        },
      };
    }

    // Check Supabase Realtime
    let supabaseRealtime: IntegrationStatus = { name: "Supabase Realtime", status: "not_configured" };
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabaseRealtime = {
        name: "Supabase Realtime",
        status: "configured",
        details: {
          url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        },
      };
    }

    const integrations = [voiceStudio, telegramBridge, abaPayWay, bakong, supabaseRealtime];

    // Get webhook configs from database
    const { data: webhooks } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .order("created_at", { ascending: false });

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "integrations",
      resourceId: "platform",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      integrations,
      webhooks: webhooks || [],
    });
  } catch (error) {
    console.error("Admin integrations error:", error);
    return json({ error: "Failed to load integrations." }, 500);
  }
}

/**
 * POST /api/admin/integrations - Configure webhook endpoints
 * Requires platform_admin or higher
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
  const action = input.action === "delete" ? "delete" : "upsert";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const events = Array.isArray(input.events) ? input.events : [];
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";
  const isActive = typeof input.isActive === "boolean" ? input.isActive : true;

  if (action === "upsert" && (!name || !url)) {
    return json({ error: "Name and URL are required." }, 400);
  }
  if (action === "upsert" && !/^https?:\/\/\S+$/.test(url)) {
    return json({ error: "Invalid URL format." }, 400);
  }

  try {
    const supabase = createAdminClient();

    if (action === "upsert") {
      const { data: current } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .eq("name", name)
        .maybeSingle();

      const { error } = await supabase
        .from("webhook_endpoints")
        .upsert({
          name,
          url,
          events,
          secret,
          is_active: isActive,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        }, { onConflict: "name" });

      if (error) {
        return json({ error: "Failed to save webhook." }, 500);
      }

      await auditLog(supabase, {
        actorId: auth.userId,
        actorRole: auth.platformRole,
        action: "upsert_webhook",
        resourceType: "webhook",
        resourceId: name,
        before: current ?? null,
        after: { name, url, events, isActive },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return json({ ok: true, name });
    } else {
      const id = typeof input.id === "string" ? input.id.trim() : "";
      if (!id) {
        return json({ error: "Webhook ID is required for deletion." }, 400);
      }

      const { data: current } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase
        .from("webhook_endpoints")
        .delete()
        .eq("id", id);

      if (error) {
        return json({ error: "Failed to delete webhook." }, 500);
      }

      await auditLog(supabase, {
        actorId: auth.userId,
        actorRole: auth.platformRole,
        action: "delete_webhook",
        resourceType: "webhook",
        resourceId: id,
        before: current ?? null,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return json({ ok: true, deleted: true });
    }
  } catch (error) {
    console.error("Admin webhook error:", error);
    return json({ error: "Failed to modify webhook." }, 500);
  }
}