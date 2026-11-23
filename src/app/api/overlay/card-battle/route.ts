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

const STAT_KEYS = ["attack", "defense", "speed", "magic", "hp"];

function pickWeightedRandom<T>(items: T[], weightFn: (item: T) => number): T {
  const totalWeight = items.reduce((sum, item) => sum + weightFn(item), 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= weightFn(item);
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function calculateCardPower(card: { stats: Record<string, unknown>; rarity: string }): number {
  let power = 0;
  for (const key of STAT_KEYS) {
    const val = Number(card.stats[key] ?? 0);
    power += val;
  }
  // Rarity multiplier
  const rarityMult: Record<string, number> = {
    common: 1.0,
    uncommon: 1.15,
    rare: 1.3,
    epic: 1.5,
    legendary: 1.8,
  };
  power *= rarityMult[card.rarity] ?? 1.0;
  return power;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    overlayToken?: unknown;
    donationIdA?: unknown;
    donationIdB?: unknown;
  } | null;

  if (typeof body?.overlayToken !== "string" || !body.overlayToken.trim()) {
    return json({ error: "invalid overlay token" }, 401);
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return json({ error: "card battle service unavailable" }, 503);
  }

  // Resolve overlay token
  const { data: resolved, error: resolveError } = await supabase.rpc(
    "streamkit_resolve_overlay",
    { p_token: body.overlayToken },
  );
  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;

  if (resolveError) {
    console.error(
      `[card-battle] streamkit_resolve_overlay failed code=${resolveError.code ?? "unknown"}`,
    );
    return json({ error: "card battle service unavailable" }, 503);
  }
  if (!overlay?.creator_id) {
    return json({ error: "invalid overlay token" }, 401);
  }

  // Get creator's card pool
  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id, name, rarity, image_url, stats")
    .eq("user_id", overlay.creator_id);

  if (cardsError || !cards || cards.length < 2) {
    return json({ error: "need at least 2 cards in pool" }, 404);
  }

  // Pick two distinct cards
  const cardA = pickWeightedRandom(cards, (c) => RARITY_WEIGHTS[c.rarity] ?? 1);
  let cardB = pickWeightedRandom(
    cards.filter((c) => c.id !== cardA.id),
    (c) => RARITY_WEIGHTS[c.rarity] ?? 1,
  );

  // Ensure cardA and cardB are distinct
  if (cardA.id === cardB.id && cards.length > 1) {
    cardB = cards.find((c) => c.id !== cardA.id) ?? cardB;
  }

  // Calculate power and determine winner
  const powerA = calculateCardPower(cardA);
  const powerB = calculateCardPower(cardB);

  let winner: "A" | "B" | "draw";
  const diff = Math.abs(powerA - powerB);
  if (diff < 5) {
    winner = "draw";
  } else if (powerA > powerB) {
    winner = "A";
  } else {
    winner = "B";
  }

  // Record pulls if donation IDs provided
  if (body.donationIdA && typeof body.donationIdA === "string") {
    const { data: tip } = await supabase
      .from("tips")
      .select("id, creator_id")
      .eq("id", body.donationIdA)
      .eq("creator_id", overlay.creator_id)
      .maybeSingle();

    if (tip) {
      const { data: existing } = await supabase
        .from("card_pulls")
        .select("id")
        .eq("donation_id", body.donationIdA)
        .maybeSingle();

      if (!existing) {
        await supabase.from("card_pulls").insert({
          user_id: overlay.creator_id,
          donation_id: body.donationIdA,
          card_id: cardA.id,
          rarity: cardA.rarity,
        });
      }
    }
  }

  if (body.donationIdB && typeof body.donationIdB === "string") {
    const { data: tip } = await supabase
      .from("tips")
      .select("id, creator_id")
      .eq("id", body.donationIdB)
      .eq("creator_id", overlay.creator_id)
      .maybeSingle();

    if (tip) {
      const { data: existing } = await supabase
        .from("card_pulls")
        .select("id")
        .eq("donation_id", body.donationIdB)
        .maybeSingle();

      if (!existing) {
        await supabase.from("card_pulls").insert({
          user_id: overlay.creator_id,
          donation_id: body.donationIdB,
          card_id: cardB.id,
          rarity: cardB.rarity,
        });
      }
    }
  }

  return json({
    cardA,
    cardB,
    winner,
    powerA: Math.round(powerA),
    powerB: Math.round(powerB),
  });
}