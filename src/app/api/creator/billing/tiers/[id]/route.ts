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
 * PATCH /api/creator/billing/tiers/[id] - Update authenticated creator's subscription tier
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  const { id: tierId } = await params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tierId)) {
    return json({ error: "Invalid tier ID format." }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  const price = typeof input.price === "number" ? input.price : undefined;
  const description = typeof input.description === "string" ? input.description.trim() : undefined;
  const badgeColor = typeof input.badgeColor === "string" ? input.badgeColor.trim() : undefined;

  if (name !== undefined) {
    if (!name) {
      return json({ error: "Tier name cannot be empty." }, 400);
    }
    if (name.length > 40) {
      return json({ error: "Tier name must be 40 characters or less." }, 400);
    }
  }
  if (price !== undefined) {
    if (price <= 0) {
      return json({ error: "Price must be greater than 0." }, 400);
    }
    if (price > 10000) {
      return json({ error: "Price cannot exceed $10,000/month." }, 400);
    }
  }
  if (badgeColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(badgeColor)) {
    return json({ error: "Badge color must be a valid hex color (e.g., #7c3aed)." }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (price !== undefined) updates.price = price;
  if (description !== undefined) updates.description = description;
  if (badgeColor !== undefined) updates.badge_color = badgeColor;

  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields to update." }, 400);
  }

  try {
    // RLS will enforce that only the creator's own tiers can be updated
    const { data: tier, error } = await supabase
      .from("subscription_tiers")
      .update(updates)
      .eq("id", tierId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return json({ error: "Tier not found or access denied." }, 404);
      }
      return json({ error: "Failed to update subscription tier." }, 500);
    }

    return json({ ok: true, tier });
  } catch (error) {
    console.error("Creator billing tier update error:", error);
    return json({ error: "Failed to update subscription tier." }, 500);
  }
}

/**
 * DELETE /api/creator/billing/tiers/[id] - Delete authenticated creator's subscription tier
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  const { id: tierId } = await params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tierId)) {
    return json({ error: "Invalid tier ID format." }, 400);
  }

  try {
    // Get tier name for potential audit (RLS enforces ownership)
    const { data: existingTier } = await supabase
      .from("subscription_tiers")
      .select("id, name")
      .eq("id", tierId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingTier) {
      return json({ error: "Tier not found or access denied." }, 404);
    }

    // RLS will enforce that only the creator's own tiers can be deleted
    const { error } = await supabase
      .from("subscription_tiers")
      .delete()
      .eq("id", tierId)
      .eq("user_id", user.id);

    if (error) {
      return json({ error: "Failed to delete subscription tier." }, 500);
    }

    return json({ ok: true, deleted: true });
  } catch (error) {
    console.error("Creator billing tier delete error:", error);
    return json({ error: "Failed to delete subscription tier." }, 500);
  }
}