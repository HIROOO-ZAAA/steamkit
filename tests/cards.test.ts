import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

describe("Card System", () => {
  const mockCards = [
    {
      id: "1",
      name: "Common Card",
      rarity: "common",
      image_url: "https://example.com/common.png",
      stats: { attack: 10, defense: 5, speed: 8, magic: 3, hp: 50 },
    },
    {
      id: "2",
      name: "Rare Card",
      rarity: "rare",
      image_url: "https://example.com/rare.png",
      stats: { attack: 20, defense: 15, speed: 12, magic: 10, hp: 80 },
    },
    {
      id: "3",
      name: "Legendary Card",
      rarity: "legendary",
      image_url: "https://example.com/legendary.png",
      stats: { attack: 40, defense: 30, speed: 25, magic: 20, hp: 150 },
    },
  ];

  it("RARITY_WEIGHTS sums to 100", () => {
    const sum = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it("pickWeightedRandom returns an item from the array", () => {
    const result = pickWeightedRandom(mockCards, (c) => RARITY_WEIGHTS[c.rarity] ?? 1);
    assert.ok(mockCards.some((c) => c.id === result.id));
  });

  it("pickWeightedRandom favors higher weight items (statistical)", () => {
    const weights: Record<string, number> = { a: 90, b: 10 };
    const items = [{ id: "a" }, { id: "b" }];
    const counts: Record<string, number> = { a: 0, b: 0 };
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const picked = pickWeightedRandom(items, (item) => weights[item.id]);
      counts[picked.id]++;
    }

    // a should be picked ~90% of the time
    assert.ok(counts.a > 8000 && counts.a < 10000);
    assert.ok(counts.b > 0 && counts.b < 2000);
  });

  it("calculateCardPower sums stats and applies rarity multiplier", () => {
    const commonCard = mockCards[0];
    const rareCard = mockCards[1];
    const legendaryCard = mockCards[2];

    const commonPower = calculateCardPower(commonCard);
    const rarePower = calculateCardPower(rareCard);
    const legendaryPower = calculateCardPower(legendaryCard);

    // Base stats: common=76, rare=137, legendary=265
    // With multipliers: common=76, rare≈178, legendary≈477
    assert.ok(commonPower < rarePower);
    assert.ok(rarePower < legendaryPower);
  });

  it("calculateCardPower handles missing stats gracefully", () => {
    const card = {
      id: "4",
      name: "No Stats Card",
      rarity: "common",
      image_url: "https://example.com/none.png",
      stats: {},
    };
    const power = calculateCardPower(card);
    assert.equal(power, 0);
  });

  it("RARITY_WEIGHTS has all expected rarities", () => {
    assert.ok("common" in RARITY_WEIGHTS);
    assert.ok("uncommon" in RARITY_WEIGHTS);
    assert.ok("rare" in RARITY_WEIGHTS);
    assert.ok("epic" in RARITY_WEIGHTS);
    assert.ok("legendary" in RARITY_WEIGHTS);
  });

  it("STAT_KEYS has expected keys", () => {
    assert.deepEqual(STAT_KEYS, ["attack", "defense", "speed", "magic", "hp"]);
  });
});
