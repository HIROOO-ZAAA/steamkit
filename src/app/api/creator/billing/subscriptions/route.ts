import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
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
 * GET /api/creator/billing/subscriptions - List subscriptions for authenticated creator's tiers
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  const status = url.searchParams.get("status");
  const tierId = url.searchParams.get("tierId");

  try {
    // First verify user has tiers, then query subscriptions for those tiers
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
        )
      `, { count: "exact" })
      .eq("tier.user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (tierId) {
      query = query.eq("tier_id", tierId);
    }

    const { data: subscriptions, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load subscriptions." }, 500);
    }

    // Fetch subscriber profiles
    const subscriberIds = [...new Set((subscriptions || []).map((s: Subscription) => s.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", subscriberIds);

    const profileMap = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
    (profiles || []).forEach((p: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => {
      profileMap.set(p.id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url });
    });

    const enriched = (subscriptions || []).map((sub: Subscription) => ({
      ...sub,
      subscriber: profileMap.get(sub.user_id) || null,
    }));

    return json({
      subscriptions: enriched,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Creator subscriptions list error:", error);
    return json({ error: "Failed to load subscriptions." }, 500);
  }
}