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
 * PATCH /api/creator/billing/subscriptions/[id] - Cancel subscription
 * Creator can cancel subscriptions for their tiers
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return json({ error: "Authentication required." }, 401);
  }

  const { id: subscriptionId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subscriptionId)) {
    return json({ error: "Invalid subscription ID format." }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const immediate = typeof input.immediate === "boolean" ? input.immediate : false;

  try {
    // Verify subscription belongs to a tier owned by this creator
    const { data: subscription, error: fetchError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        tier:subscription_tiers!inner (
          id,
          name,
          user_id
        )
      `)
      .eq("id", subscriptionId)
      .eq("tier.user_id", user.id)
      .single();

    if (fetchError || !subscription) {
      return json({ error: "Subscription not found or access denied." }, 404);
    }

    if (immediate) {
      const { data: updated, error: updateError } = await supabase
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .select()
        .single();

      if (updateError) {
        return json({ error: "Failed to cancel subscription." }, 500);
      }

      return json({ ok: true, subscription: updated });
    } else {
      const { data: updated, error: updateError } = await supabase
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .select()
        .single();

      if (updateError) {
        return json({ error: "Failed to schedule cancellation." }, 500);
      }

      return json({ ok: true, subscription: updated });
    }
  } catch (error) {
    console.error("Creator subscription cancel error:", error);
    return json({ error: "Failed to update subscription." }, 500);
  }
}