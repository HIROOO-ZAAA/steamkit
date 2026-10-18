import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALERT_DURATION_SECONDS,
  amountForTierTest,
  applyTier,
  highlightText,
  parseTemplate,
  pickTier,
  splitSpeechText,
  speechText,
  shouldSpeakAlert,
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

  // The token picker offers these three, so they have to actually resolve.
  // Before this they rendered as the literal text "{newline}" on the alert.
  it("expands the spacing tokens the token picker offers", () => {
    assert.equal(parseTemplate("a{space}b", tip()), "a b");
    assert.equal(parseTemplate("a{space:5}b", tip()), "a     b");
    assert.equal(parseTemplate("a{newline}b", tip()), "a\nb");
    assert.equal(parseTemplate("{space:0}", tip()), "");
  });

  it("resolves {space:N} before {space}, so no literal N} is left behind", () => {
    // The ordering bug this guards: matching {space} first would turn
    // "{space:5}" into " 5}" and leave a stray brace on the stream.
    const out = parseTemplate("{space:5}", tip());
    assert.equal(out, "     ");
    assert.doesNotMatch(out, /[{}]/);
  });

  it("caps {space:N} so a creator cannot inject an unbounded string", () => {
    assert.ok(parseTemplate("{space:9999}", tip()).length <= 100);
    // Non-numeric is left alone rather than being silently dropped, so a typo
    // is visible instead of invisible.
    assert.equal(parseTemplate("{space:abc}", tip()), "{space:abc}");
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

describe("speechText", () => {
  it("appends the donor message when the template has no {message}", () => {
    assert.equal(
      speechText("Thanks {name}", tip({ message: "Great stream" })),
      "Thanks Sophea Great stream",
    );
  });

  it("never speaks the message twice when the template already has {message}", () => {
    const out = speechText("Thanks {name}: {message}", tip({ message: "Great stream" }));
    assert.equal(out, "Thanks Sophea Great stream");
    assert.equal(out.match(/Great stream/g)?.length, 1);
  });

  it("treats only the exact {message} token as 'already included'", () => {
    assert.equal(
      speechText("Hi {name} {message}", tip({ message: "Yo" })),
      "Hi Sophea Yo",
    );
    // parseTemplate leaves a spaced variant literal, so it is not a placeholder
    // and must not suppress the donor's words.
    assert.equal(
      speechText("Hi {name} { message }", tip({ message: "Yo" })),
      "Hi Sophea { message } Yo",
    );
  });

  it("keeps the viewer message after the donor and amount, and reads it in full", () => {
    const message =
      "Hello StreamKit, this is a voice test. Please read this entire message aloud.";
    const out = speechText(
      "{message} {name} donated {amount} dollars.",
      tip({ tipper_name: "Alex", amount: 5, currency: "USD", message }),
    );

    assert.equal(out, `Alex donated 5 dollars. ${message}`);
    assert.ok(out.indexOf("Alex") < out.indexOf("5 dollars"));
    assert.ok(out.indexOf("5 dollars") < out.indexOf(message));
  });

  it("leaves a message-less donation as just the acknowledgement", () => {
    assert.equal(speechText("Thanks {name}", tip({ message: null })), "Thanks Sophea");
    assert.equal(speechText("Thanks {name}", tip({ message: "" })), "Thanks Sophea");
    assert.equal(speechText("Thanks {name}", tip({ message: "   " })), "Thanks Sophea");
  });

  it("keeps the acknowledgement before the message", () => {
    const out = speechText("Thank you {name}", tip({ message: "Hello there" }));
    assert.ok(out.indexOf("Sophea") < out.indexOf("Hello there"));
  });

  it("speaks only the message when the template renders to nothing", () => {
    assert.equal(speechText("", tip({ message: "Just this" })), "Just this");
    assert.equal(speechText("{avatar}", tip({ message: "Just this" })), "Just this");
  });

  it("does not leave a stray separator when the template is only a placeholder", () => {
    assert.equal(speechText("{message}", tip({ message: "Only me" })), "Only me");
  });

  it("never leaks placeholder syntax into the spoken line", () => {
    const out = speechText("Hi {name}", tip({ message: "Yo" }));
    assert.doesNotMatch(out, /\{|\}/);
  });

  it("keeps a long donation message complete in the spoken line", () => {
    const longMessage = "word ".repeat(80).trim();
    assert.equal(
      speechText("Thanks {name}", tip({ message: longMessage })),
      `Thanks Sophea ${longMessage}`,
    );
  });

  it("speaks currency names and natural whole-number amounts", () => {
    assert.equal(
      speechText("{name} donated {amount}{currency}.", tip({ tipper_name: "Alex", amount: 5, currency: "USD" })),
      "Alex donated 5 dollars.",
    );
    assert.equal(
      speechText("{name} donated {amount}{currency}.", tip({ tipper_name: "Alex", amount: 1, currency: "USD" })),
      "Alex donated 1 dollar.",
    );
    assert.equal(
      speechText("{name} donated {amount}{currency}.", tip({ tipper_name: "Alex", amount: 15000, currency: "KHR" })),
      "Alex donated 15,000 riel.",
    );
    assert.equal(
      speechText("{name} donated {amount}.", tip({ tipper_name: "Alex", amount: 15000, currency: "KHR" })),
      "Alex donated 15,000 riel.",
    );
    assert.equal(
      speechText("អរគុណ {name} {amount}{currency}", tip({ tipper_name: "Alex", amount: 15000, currency: "KHR" })),
      "អរគុណ Alex 15,000 រៀល",
    );
    assert.equal(
      speechText("អរគុណ {name} {amount}{currency}", tip({ tipper_name: "Alex", amount: 5, currency: "USD" })),
      "អរគុណ Alex 5 ដុល្លារ",
    );
  });

  it("splits long speech into bounded chunks without losing words", () => {
    const line = `Thanks Sophea ${Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ")}`;
    const chunks = splitSpeechText(line);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 110));
    assert.equal(chunks.join(" "), line);
  });

  it("splits unspaced text on Unicode-safe character boundaries", () => {
    const line = "អរគុណ🙂".repeat(40);
    const chunks = splitSpeechText(line, 25);
    assert.ok(chunks.every((chunk) => chunk.length <= 25));
    assert.equal(chunks.join(""), line);
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

describe("amountForTierTest", () => {
  const tiers = [
    tier({ tier_id: "small", min_amount_usd: 5, min_amount_khr: 5000, sort_order: 0 }),
    tier({ tier_id: "large", min_amount_usd: 20, min_amount_khr: 20000, sort_order: 1 }),
  ];

  it("raises a test amount to the selected tier's minimum", () => {
    assert.equal(amountForTierTest(2, "USD", "small", tiers), 5);
  });

  it("keeps the test amount below the next tier", () => {
    assert.equal(amountForTierTest(50, "USD", "small", tiers), 19.99);
  });

  it("uses the base settings when the selected amount is below the first tier", () => {
    assert.equal(amountForTierTest(10, "USD", null, tiers), 4.99);
  });

  it("uses the selected KHR tier and KHR step size", () => {
    assert.equal(amountForTierTest(1000, "KHR", "small", tiers), 5000);
    assert.equal(amountForTierTest(50000, "KHR", "small", tiers), 19999);
  });
});

describe("alert test speech policy", () => {
  it("keeps alerts on screen for exactly two seconds", () => {
    assert.equal(ALERT_DURATION_SECONDS, 2);
  });

  it("always reads tests and honors an explicitly selected clone for real donations", () => {
    assert.equal(shouldSpeakAlert(false, true), true);
    assert.equal(shouldSpeakAlert(true, false), true);
    assert.equal(shouldSpeakAlert(false, false), false);
    assert.equal(shouldSpeakAlert(false, false, true), true);
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
