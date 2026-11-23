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

/**
 * GET /api/creator/billing/tiers - List authenticated creator's subscription tiers
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

  try {
    const query = supabase
      .from("subscription_tiers")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: tiers, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load subscription tiers." }, 500);
    }

    return json({
      tiers: tiers || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Creator billing tiers list error:", error);
    return json({ error: "Failed to load subscription tiers." }, 500);
  }
}

/**
 * POST /api/creator/billing/tiers - Create a new subscription tier for authenticated creator
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const price = typeof input.price === "number" ? input.price : 0;
  const description = typeof input.description === "string" ? input.description.trim() : null;
  const badgeColor = typeof input.badgeColor === "string" ? input.badgeColor.trim() : "#7c3aed";

  if (!name) {
    return json({ error: "Tier name is required." }, 400);
  }
  if (name.length > 40) {
    return json({ error: "Tier name must be 40 characters or less." }, 400);
  }
  if (price <= 0) {
    return json({ error: "Price must be greater than 0." }, 400);
  }
  if (price > 10000) {
    return json({ error: "Price cannot exceed $10,000/month." }, 400);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(badgeColor)) {
    return json({ error: "Badge color must be a valid hex color (e.g., #7c3aed)." }, 400);
  }

  try {
    const { data: tier, error } = await supabase
      .from("subscription_tiers")
      .insert({
        user_id: user.id,
        name,
        price,
        description,
        badge_color: badgeColor,
      })
      .select("*")
      .single();

    if (error) {
      return json({ error: "Failed to create subscription tier." }, 500);
    }

    return json({ ok: true, tier }, 201);
  } catch (error) {
    console.error("Creator billing tier create error:", error);
    return json({ error: "Failed to create subscription tier." }, 500);
  }
}