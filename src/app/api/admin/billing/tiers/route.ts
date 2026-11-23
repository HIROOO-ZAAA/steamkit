import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireBillingAdmin,
  auditLog,
  getClientIp,
  getUserAgent,
} from "@/lib/auth/requirePlatformRole";

export const runtime = "nodejs";

function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

interface SubscriptionTier {
  id: string;
  user_id: string;
  name: string;
  price: number;
  description: string | null;
  badge_color: string;
  created_at: string;
}

// Validation constants
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PRICE = 10000;
const MAX_NAME_LENGTH = 40;

/**
 * Rate limiting helper - uses streamkit_allow_payment_request RPC
 */
async function checkRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  action: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("streamkit_allow_payment_request", {
      p_user_id: userId,
      p_request_type: action,
    });

    if (error) {
      console.warn("Rate limit check failed:", error);
      return { allowed: true }; // Fail open for rate limiting
    }

    return data as { allowed: boolean; retryAfter?: number };
  } catch {
    return { allowed: true };
  }
}

/**
 * Validate UUID format
 */
function validateUuid(value: string | undefined, fieldName: string): string | null {
  if (!value) {
    return `${fieldName} is required.`;
  }
  if (!UUID_REGEX.test(value)) {
    return `${fieldName} must be a valid UUID.`;
  }
  return null;
}

/**
 * GET /api/admin/billing/tiers - List all subscription tiers
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
  const creatorId = url.searchParams.get("creatorId") || "";

  // Validate creatorId if provided
  if (creatorId) {
    const uuidError = validateUuid(creatorId, "Creator ID");
    if (uuidError) {
      return json({ error: uuidError }, 400);
    }
  }

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("subscription_tiers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (creatorId) {
      query = query.eq("user_id", creatorId);
    }

    const { data: tiers, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load subscription tiers." }, 500);
    }

    // Fetch creator usernames for display
    const creatorIds = [...new Set((tiers || []).map((t: SubscriptionTier) => t.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", creatorIds);

    const profileMap = new Map<string, { username: string; display_name: string | null }>();
    (profiles || []).forEach((p: { id: string; username: string; display_name: string | null }) => {
      profileMap.set(p.id, { username: p.username, display_name: p.display_name });
    });

    const enrichedTiers = (tiers || []).map((tier: SubscriptionTier) => ({
      ...tier,
      creator: profileMap.get(tier.user_id) || null,
    }));

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "subscription_tier",
      resourceId: "list",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      tiers: enrichedTiers,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Admin billing tiers list error:", error);
    return json({ error: "Failed to load subscription tiers." }, 500);
  }
}

/**
 * POST /api/admin/billing/tiers - Create a new subscription tier
 * Requires billing_admin or higher
 */
export async function POST(request: Request) {
  const auth = await requireBillingAdmin(request);
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
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const price = typeof input.price === "number" ? input.price : 0;
  const description = typeof input.description === "string" ? input.description.trim() : null;
  const badgeColor = typeof input.badgeColor === "string" ? input.badgeColor.trim() : "#7c3aed";

  // Validate inputs
  const userIdError = validateUuid(userId, "Creator user ID");
  if (userIdError) {
    return json({ error: userIdError }, 400);
  }

  if (!name) {
    return json({ error: "Tier name is required." }, 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return json({ error: `Tier name must be ${MAX_NAME_LENGTH} characters or less.` }, 400);
  }
  if (price <= 0) {
    return json({ error: "Price must be greater than 0." }, 400);
  }
  if (price > MAX_PRICE) {
    return json({ error: `Price cannot exceed $${MAX_PRICE.toLocaleString()}/month.` }, 400);
  }
  if (!HEX_COLOR_REGEX.test(badgeColor)) {
    return json({ error: "Badge color must be a valid hex color (e.g., #7c3aed)." }, 400);
  }

  try {
    const supabase = createAdminClient();

    // Rate limiting for tier creation
    const rateLimit = await checkRateLimit(supabase, auth.userId, "tier_create");
    if (!rateLimit.allowed) {
      return json(
        { error: "Rate limit exceeded. Please try again later." },
        429,
        rateLimit.retryAfter ? { "Retry-After": String(rateLimit.retryAfter) } : {}
      );
    }

    // Verify creator exists
    const { data: creator } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!creator) {
      return json({ error: "Creator not found." }, 404);
    }

    const { data: tier, error } = await supabase
      .from("subscription_tiers")
      .insert({
        user_id: userId,
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

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "create",
      resourceType: "subscription_tier",
      resourceId: tier.id,
      after: { userId, name, price, description, badgeColor },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({ ok: true, tier }, 201);
  } catch (error) {
    console.error("Admin billing tier create error:", error);
    return json({ error: "Failed to create subscription tier." }, 500);
  }
}

/**
 * PATCH /api/admin/billing/tiers - Update a subscription tier
 * Requires billing_admin or higher
 */
export async function PATCH(request: Request) {
  const auth = await requireBillingAdmin(request);
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
  const tierId = typeof input.tierId === "string" ? input.tierId.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  const price = typeof input.price === "number" ? input.price : undefined;
  const description = typeof input.description === "string" ? input.description.trim() : undefined;
  const badgeColor = typeof input.badgeColor === "string" ? input.badgeColor.trim() : undefined;

  // Validate UUIDs
  const tierIdError = validateUuid(tierId, "Tier ID");
  if (tierIdError) {
    return json({ error: tierIdError }, 400);
  }
  const userIdError = validateUuid(userId, "Creator user ID");
  if (userIdError) {
    return json({ error: userIdError }, 400);
  }

  if (badgeColor !== undefined && !HEX_COLOR_REGEX.test(badgeColor)) {
    return json({ error: "Badge color must be a valid hex color (e.g., #7c3aed)." }, 400);
  }
  if (price !== undefined && price <= 0) {
    return json({ error: "Price must be greater than 0." }, 400);
  }
  if (price !== undefined && price > MAX_PRICE) {
    return json({ error: `Price cannot exceed $${MAX_PRICE.toLocaleString()}/month.` }, 400);
  }
  if (name !== undefined) {
    if (!name) {
      return json({ error: "Tier name cannot be empty." }, 400);
    }
    if (name.length > MAX_NAME_LENGTH) {
      return json({ error: `Tier name must be ${MAX_NAME_LENGTH} characters or less.` }, 400);
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (price !== undefined) updates.price = price;
  if (description !== undefined) updates.description = description;
  if (badgeColor !== undefined) updates.badge_color = badgeColor;

  if (Object.keys(updates).length === 0) {
    return json({ error: "No fields to update." }, 400);
  }

  try {
    const supabase = createAdminClient();

    // Rate limiting for tier updates
    const rateLimit = await checkRateLimit(supabase, auth.userId, "tier_update");
    if (!rateLimit.allowed) {
      return json(
        { error: "Rate limit exceeded. Please try again later." },
        429,
        rateLimit.retryAfter ? { "Retry-After": String(rateLimit.retryAfter) } : {}
      );
    }

    // Verify tier belongs to creator
    const { data: existingTier } = await supabase
      .from("subscription_tiers")
      .select("id")
      .eq("id", tierId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingTier) {
      return json({ error: "Tier not found or access denied." }, 404);
    }

    const { data: tier, error } = await supabase
      .from("subscription_tiers")
      .update(updates)
      .eq("id", tierId)
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
      resourceId: tierId,
      after: updates,
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
 * DELETE /api/admin/billing/tiers - Delete a subscription tier
 * Requires billing_admin or higher
 */
export async function DELETE(request: Request) {
  const auth = await requireBillingAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const url = new URL(request.url);
  const tierId = url.searchParams.get("tierId") ?? "";
  const userId = url.searchParams.get("userId") ?? "";

  const tierIdError = validateUuid(tierId, "Tier ID");
  if (tierIdError) {
    return json({ error: tierIdError }, 400);
  }
  const userIdError = validateUuid(userId, "Creator user ID");
  if (userIdError) {
    return json({ error: userIdError }, 400);
  }

  try {
    const supabase = createAdminClient();

    // Rate limiting for tier deletion
    const rateLimit = await checkRateLimit(supabase, auth.userId, "tier_delete");
    if (!rateLimit.allowed) {
      return json(
        { error: "Rate limit exceeded. Please try again later." },
        429,
        rateLimit.retryAfter ? { "Retry-After": String(rateLimit.retryAfter) } : {}
      );
    }

    // Verify tier belongs to creator
    const { data: existingTier } = await supabase
      .from("subscription_tiers")
      .select("id, name")
      .eq("id", tierId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingTier) {
      return json({ error: "Tier not found or access denied." }, 404);
    }

    const tierName = existingTier.name as string;

    const { error } = await supabase
      .from("subscription_tiers")
      .delete()
      .eq("id", tierId);

    if (error) {
      return json({ error: "Failed to delete subscription tier." }, 500);
    }

    // Audit log
    const beforeObj: { name: string } = { name: tierName };
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "delete",
      resourceType: "subscription_tier",
      resourceId: tierId,
      before: beforeObj,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Admin billing tier delete error:", error);
    return json({ error: "Failed to delete subscription tier." }, 500);
  }
}