import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const RARITY_WEIGHTS: Record<string, number> = {
  common: 50,
  uncommon: 25,
  rare: 15,
  epic: 7,
  legendary: 3,
};

function pickWeightedRandom<T>(items: T[], weightFn: (item: T) => number): T {
  const totalWeight = items.reduce((sum, item) => sum + weightFn(item), 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= weightFn(item);
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    overlayToken?: unknown;
    donationId?: unknown;
  } | null;

  if (typeof body?.overlayToken !== "string" || !body.overlayToken.trim()) {
    return json({ error: "invalid overlay token" }, 401);
  }
  if (body.donationId !== undefined && typeof body.donationId !== "string") {
    return json({ error: "invalid donation id" }, 400);
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return json({ error: "card pull service unavailable" }, 503);
  }

  // Resolve overlay token
  const { data: resolved, error: resolveError } = await supabase.rpc(
    "streamkit_resolve_overlay",
    { p_token: body.overlayToken },
  );
  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;

  if (resolveError) {
    console.error(
      `[card-pull] streamkit_resolve_overlay failed code=${resolveError.code ?? "unknown"}`,
    );
    return json({ error: "card pull service unavailable" }, 503);
  }
  if (!overlay?.creator_id) {
    return json({ error: "invalid overlay token" }, 401);
  }

  // Get creator's card pool
  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id, name, rarity, image_url, stats")
    .eq("user_id", overlay.creator_id);

  if (cardsError || !cards || cards.length === 0) {
    return json({ error: "no cards in pool" }, 404);
  }

  // Pick weighted random card
  const pulledCard = pickWeightedRandom(cards, (c) => RARITY_WEIGHTS[c.rarity] ?? 1);

  // Record the pull if donationId provided
  let isNew = false;
  if (body.donationId && typeof body.donationId === "string") {
    const { data: tip, error: tipError } = await supabase
      .from("tips")
      .select("id, creator_id")
      .eq("id", body.donationId)
      .eq("creator_id", overlay.creator_id)
      .maybeSingle();

    if (!tipError && tip) {
      // Check if this donation already pulled a card
      const { data: existingPull } = await supabase
        .from("card_pulls")
        .select("id")
        .eq("donation_id", body.donationId)
        .maybeSingle();

      if (!existingPull) {
        const { error: pullError } = await supabase
          .from("card_pulls")
          .insert({
            user_id: overlay.creator_id,
            donation_id: body.donationId,
            card_id: pulledCard.id,
            rarity: pulledCard.rarity,
          });

        if (!pullError) {
          isNew = true;
        }
      }
    }
  }

  return json({
    card: pulledCard,
    isNew,
  });
}