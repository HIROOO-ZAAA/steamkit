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

/**
 * PATCH /api/admin/billing/tiers/[id] - Update a subscription tier
 * Requires billing_admin or higher
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBillingAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const { id } = await params;

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

  if (name !== undefined && !name) {
    return json({ error: "Tier name cannot be empty." }, 400);
  }
  if (price !== undefined && price <= 0) {
    return json({ error: "Price must be greater than 0." }, 400);
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
    const supabase = createAdminClient();

    // Get current tier for audit log
    const { data: current } = await supabase
      .from("subscription_tiers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return json({ error: "Subscription tier not found." }, 404);
    }

    const { data: tier, error } = await supabase
      .from("subscription_tiers")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return json({ error: "Failed to update subscription tier." }, 500);
    }

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "update",
      resourceType: "subscription_tier",
      resourceId: id,
      before: current,
      after: tier,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({ ok: true, tier });
  } catch (error) {
    console.error("Admin billing tier update error:", error);
    return json({ error: "Failed to update subscription tier." }, 500);
  }
}

/**
 * DELETE /api/admin/billing/tiers/[id] - Delete a subscription tier
 * Requires billing_admin or higher
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBillingAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = createAdminClient();

    // Get current tier for audit log
    const { data: current } = await supabase
      .from("subscription_tiers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return json({ error: "Subscription tier not found." }, 404);
    }

    const { error } = await supabase
      .from("subscription_tiers")
      .delete()
      .eq("id", id);

    if (error) {
      return json({ error: "Failed to delete subscription tier." }, 500);
    }

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "delete",
      resourceType: "subscription_tier",
      resourceId: id,
      before: current,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({ ok: true, deleted: true });
  } catch (error) {
    console.error("Admin billing tier delete error:", error);
    return json({ error: "Failed to delete subscription tier." }, 500);
  }
}