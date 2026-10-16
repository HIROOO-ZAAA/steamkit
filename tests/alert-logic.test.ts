import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTier,
  highlightText,
  parseTemplate,
  pickTier,
  type AlertSettings,
  type AlertTier,
  type TemplateTip,
} from "../src/lib/overlay/alert-logic.ts";

const tip = (over: Partial<TemplateTip> = {}): TemplateTip => ({
  tipper_name: "Sophea",
  amount: 10,
  currency: "USD",
  message: null,
  ...over,
});

const tier = (over: Partial<AlertTier> = {}): AlertTier => ({
  tier_id: "t1",
  name: "Tier",
  min_amount_usd: 0,
  min_amount_khr: 0,
  sort_order: 0,
  configured: true,
  ...over,
});

/**
 * Mirrors the shape `applyConfig` builds in the overlay page: every optional
 * `AlertSettings` key is enumerated with a default, and none left undefined.
 *
 * That detail is load-bearing. `applyTier` copies a tier field only when the
 * key already exists on the base object, so a field that is merely *declared*
 * optional but absent from the live object is dropped without a word. Keeping
 * this helper faithful is what stops the suite from quietly blessing a base
 * object that production never builds.
 */
const base = (over: Partial<AlertSettings> = {}): AlertSettings => ({
  duration_seconds: 6,
  sound_url: "https://example.test/base.mp3",
  animation_type: "bounce",
  font_color: "#10b981",
  tts_enabled: true,
  layout: "image_left",
  image_url: "",
  image_scale: 50,
  show_donor_profile: true,
  message_template: "Thanks {name}",
  text_color: "#FFFFFF",
  bg_color: "#000000",
  enable_card: false,
  font_family: "'Noto Sans Khmer', sans-serif",
  font_size: 36,
  font_weight: "700",
  text_animation: "Fade",
  alert_animation: "bounce",
  text_delay: 0,
  donor_avatar: "🦔",
  ...over,
});

describe("parseTemplate", () => {
  it("substitutes every placeholder the product documents", () => {
    const out = parseTemplate(
      "{name} sent {amount}{currency}: {message}",
      tip({ amount: 5, currency: "USD", message: "great stream" }),
    );
    assert.equal(out, "Sophea sent 5.00USD: great stream");
  });

  it("renders USD to exactly two decimals", () => {
    assert.equal(parseTemplate("{amount}", tip({ amount: 5 })), "5.00");
    assert.equal(parseTemplate("{amount}", tip({ amount: 5.5 })), "5.50");
    assert.equal(parseTemplate("{amount}", tip({ amount: 1234.5 })), "1234.50");
  });

  it("groups KHR thousands, tolerating either separator", () => {
    // toLocaleString() with no locale follows the host, so the OBS browser and
    // this test can disagree on "," vs ".". That divergence is real and is the
    // reason this assertion does not hardcode a separator.
    assert.match(parseTemplate("{amount}", tip({ amount: 10000, currency: "KHR" })), /^10[.,]000$/);
  });

  it("does not apply USD decimal padding to KHR", () => {
    assert.doesNotMatch(
      parseTemplate("{amount}", tip({ amount: 100, currency: "KHR" })),
      /\.\d\d$/,
    );
  });

  it("treats a null message as empty, never the string 'null'", () => {
    assert.equal(parseTemplate("[{message}]", tip({ message: null })), "[]");
  });

  it("drops {avatar}, which has no per-donor source", () => {
    assert.equal(parseTemplate("<{avatar}>", tip()), "<>");
  });

  it("replaces every occurrence, not just the first", () => {
    assert.equal(parseTemplate("{name}/{name}", tip()), "Sophea/Sophea");
  });

  it("leaves an unknown placeholder untouched rather than blanking it", () => {
    assert.equal(parseTemplate("{nope}", tip()), "{nope}");
  });
});

describe("highlightText", () => {
  it("wraps a trailing currency amount in a coloured span", () => {
    const out = highlightText("thanks for 10.00USD", "#ff0000");
    assert.match(out, /<span style="color:#ff0000;font-weight:800">10\.00USD<\/span>/);
  });

  it("leaves text with no amount alone", () => {
    assert.equal(highlightText("thank you", "#ff0000"), "thank you");
  });
});

describe("pickTier", () => {
  // The two minimums deliberately differ by ~4 orders of magnitude. Reading the
  // wrong column would make a KHR tip match a tier meant for $5, which is the
  // cross-currency bug this whole design exists to prevent.
  const tiers = [
    tier({ tier_id: "small", min_amount_usd: 5, min_amount_khr: 50000 }),
    tier({ tier_id: "big", min_amount_usd: 50, min_amount_khr: 500000 }),
  ];

  it("returns null when nothing matches, meaning 'use base settings'", () => {
    assert.equal(pickTier(tiers, tip({ amount: 1 })), null);
    assert.equal(pickTier([], tip({ amount: 999 })), null);
  });

  it("picks the highest minimum the USD tip clears", () => {
    assert.equal(pickTier(tiers, tip({ amount: 10 }))?.tier_id, "small");
    assert.equal(pickTier(tiers, tip({ amount: 50 }))?.tier_id, "big");
  });

  it("treats the minimum as inclusive", () => {
    assert.equal(pickTier(tiers, tip({ amount: 5 }))?.tier_id, "small");
    assert.equal(pickTier(tiers, tip({ amount: 49.99 }))?.tier_id, "small");
  });

  it("compares a KHR tip against min_amount_khr, never min_amount_usd", () => {
    // 40000 KHR is under 50000, so no tier should match -- even though it is
    // far above the $5 USD minimum.
    assert.equal(pickTier(tiers, tip({ amount: 40000, currency: "KHR" })), null);
    assert.equal(pickTier(tiers, tip({ amount: 60000, currency: "KHR" }))?.tier_id, "small");
    assert.equal(pickTier(tiers, tip({ amount: 500000, currency: "KHR" }))?.tier_id, "big");
  });

  it("is order-independent -- the highest match wins, not the last", () => {
    const shuffled = [tiers[1]!, tiers[0]!];
    assert.equal(pickTier(shuffled, tip({ amount: 60 }))?.tier_id, "big");
  });

  it("tolerates string-encoded amounts and minimums from jsonb", () => {
    const loose = [tier({ tier_id: "small", min_amount_usd: "5" as unknown as number })];
    assert.equal(pickTier(loose, tip({ amount: 10 }))?.tier_id, "small");
  });
});

describe("applyTier", () => {
  it("returns the base settings unchanged when no tier matched", () => {
    const settings = base();
    assert.equal(applyTier(settings, null), settings);
  });

  it("drops a tier field the base object never declares, with no error", () => {
    // The `key in merged` guard means an unknown field is a silent no-op. That
    // is safe today only because applyConfig enumerates every AlertSettings
    // key with a default; adding a column to the SQL jsonb without adding it
    // there would reproduce defect 1 from the 2026-10-14 review.
    const sparse = { duration_seconds: 6 } as AlertSettings;
    const out = applyTier(sparse, tier({ layout: "image_bottom" }));
    assert.equal("layout" in out, false);
  });

  it("overlays the fields the tier actually sets", () => {
    const out = applyTier(
      base(),
      tier({ duration_seconds: 12, font_color: "#ff00ff", layout: "image_bottom" }),
    );
    assert.equal(out.duration_seconds, 12);
    assert.equal(out.font_color, "#ff00ff");
    assert.equal(out.layout, "image_bottom");
  });

  it("lets an unconfigured field fall through to the base value", () => {
    // A tier row can exist with no matching alert_settings row, so every visual
    // field arrives null. Blanking them instead would hide the donor photo.
    const out = applyTier(
      base({ image_url: "https://example.test/photo.jpg", enable_card: true }),
      tier({ configured: false, image_url: null, enable_card: null }),
    );
    assert.equal(out.image_url, "https://example.test/photo.jpg");
    assert.equal(out.enable_card, true);
  });

  it("does not mutate the base settings object", () => {
    const settings = base();
    applyTier(settings, tier({ duration_seconds: 30 }));
    assert.equal(settings.duration_seconds, 6);
  });

  it("applies per-tier text delay, the bug that shipped broken once already", () => {
    assert.equal(applyTier(base({ text_delay: 0 }), tier({ text_delay: 3 })).text_delay, 3);
  });

  it("silently drops a key the base settings do not have", () => {
    // This is the trap, pinned deliberately. Migration 20261010000000 emitted
    // `delay_seconds` where applyTier reads `text_delay`, and the mismatch was
    // a no-op rather than an error. If this test ever needs changing, the fix
    // belongs in the SQL jsonb, not here.
    const out = applyTier(base({ text_delay: 0 }), tier({ delay_seconds: 9 } as Partial<AlertTier>));
    assert.equal(out.text_delay, 0);
    assert.equal("delay_seconds" in out, false);
  });

  it("does not carry tier bookkeeping onto the settings object", () => {
    const out = applyTier(base(), tier({ name: "Gold", min_amount_usd: 50, configured: true }));
    assert.equal("min_amount_usd" in out, false);
    assert.equal("configured" in out, false);
    assert.equal("tier_id" in out, false);
  });
});