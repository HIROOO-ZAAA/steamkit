import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireBillingAdmin,
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

interface Subscription {
  id: string;
  tier_id: string;
  creator_id: string;
  user_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  trial_end: string | null;
  payment_provider: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  last_payment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/admin/billing/subscriptions - List all subscriptions
 * Requires billing_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requireBillingAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  const status = url.searchParams.get("status");
  const creatorId = url.searchParams.get("creatorId");
  const tierId = url.searchParams.get("tierId");

  if (creatorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) {
    return json({ error: "Invalid creator ID format." }, 400);
  }
  if (tierId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tierId)) {
    return json({ error: "Invalid tier ID format." }, 400);
  }

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("subscriptions")
      .select(`
        *,
        tier:subscription_tiers!inner (
          id,
          name,
          price,
          badge_color,
          user_id
        ),
        subscriber:profiles!subscriptions_user_id_fkey (
          id,
          username,
          display_name
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (creatorId) {
      query = query.eq("creator_id", creatorId);
    }
    if (tierId) {
      query = query.eq("tier_id", tierId);
    }

    const { data: subscriptions, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load subscriptions." }, 500);
    }

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "subscription",
      resourceId: "list",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      subscriptions: subscriptions || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Admin subscriptions list error:", error);
    return json({ error: "Failed to load subscriptions." }, 500);
  }
}