import { createAdminClient } from "@/lib/supabase/admin";
import { claimAlertOnce } from "@/lib/overlay/alert-claim";
import { applyTier, pickTier, type AlertSettings, type AlertTier } from "@/lib/overlay/alert-logic";

export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    overlayToken?: unknown;
    tipId?: unknown;
  } | null;
  if (
    typeof body?.overlayToken !== "string" ||
    !body.overlayToken.trim() ||
    typeof body.tipId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.tipId)
  ) {
    return response({ error: "invalid alert claim request" }, 400);
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return response({ error: "overlay claim service unavailable" }, 503);
  }
  const { data: resolved, error: resolveError } = await supabase.rpc(
    "streamkit_resolve_overlay",
    { p_token: body.overlayToken },
  );
  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;
  // These two failures are NOT the same and must not look the same. A 42501 here
  // is the bridge missing `grant execute ... to service_role`, not a bad secret;
  // reporting it as "invalid overlay token" sent the creator to re-copy a URL
  // that was already correct. Log the SQLSTATE so it can never be guessed at
  // again, and say plainly which side is broken.
  if (resolveError) {
    console.error(
      `[claim-alert] streamkit_resolve_overlay failed code=${resolveError.code ?? "unknown"} ` +
        `message=${String(resolveError.message ?? "").slice(0, 160)}`,
    );
    return response({ error: "alert service unavailable" }, 503);
  }
  if (!overlay?.creator_id) {
    return response({ error: "invalid overlay token" }, 401);
  }

  const { data: tip, error: tipError } = await supabase
    .from("tips")
    .select("id, payment_status, amount, currency")
    .eq("id", body.tipId)
    .eq("creator_id", overlay.creator_id)
    .maybeSingle();
  if (tipError) return response({ error: "could not verify alert" }, 503);
  if (!tip || (tip.payment_status !== "successful" && tip.payment_status !== "test")) {
    return response({ error: "alert not found" }, 404);
  }

  const tier = pickTier(
    (Array.isArray(overlay.tiers) ? overlay.tiers : []) as AlertTier[],
    { amount: tip.amount, currency: tip.currency } as Parameters<typeof pickTier>[1],
  );
  const effectiveSettings = applyTier(overlay as AlertSettings, tier);

  try {
    const claimed = await claimAlertOnce(tip.id, async () => {
      const { data, error } = await supabase
        .from("tips")
        .update({ played_in_overlay: true })
        .eq("id", tip.id)
        .eq("creator_id", overlay.creator_id)
        .eq("played_in_overlay", false)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    });

    return response({
      claimed,
      cloneSelected:
        overlay.cloning_enabled === true && Boolean(overlay.active_clone_id),
      ttsEnabled: effectiveSettings.tts_enabled === true,
    });
  } catch {
    return response({ error: "could not claim alert" }, 503);
  }
}
