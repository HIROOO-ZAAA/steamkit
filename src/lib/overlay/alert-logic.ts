import type { Tip } from "@/lib/types";

/**
 * Pure alert-rendering logic, extracted from the overlay page so it can be
 * tested. `src/app/overlay/alerts/page.tsx` is a client component full of
 * browser APIs; none of the decision-making below needs a DOM, and the bugs
 * that actually reached production here (a tier key silently dropped, a media
 * column never copied) were all in this logic.
 */

export type AlertSettings = {
  duration_seconds: number;
  sound_url: string;
  animation_type: "bounce" | "fade" | "slide" | "zoom";
  font_color: string;
  tts_enabled: boolean;
  layout?: string;
  image_url?: string;
  image_scale?: number;
  show_donor_profile?: boolean;
  message_template?: string;
  text_color?: string;
  bg_color?: string;
  enable_card?: boolean;
  font_family?: string;
  font_size?: number;
  font_weight?: string;
  text_animation?: string;
  alert_animation?: string;
  text_delay?: number;
  donor_avatar?: string;
};

/**
 * One entry from the RPC's `tiers` jsonb array. Every visual field is nullable
 * because a tier row may exist in `alert_tiers` without a matching
 * `alert_settings` row -- `configured: false` means "inherit everything from
 * the creator's base settings".
 */
export type AlertTier = {
  tier_id: string;
  name: string;
  min_amount_usd: number;
  min_amount_khr: number;
  sort_order: number;
  configured: boolean;
  duration_seconds?: number | null;
  sound_url?: string | null;
  font_color?: string | null;
  tts_enabled?: boolean | null;
  layout?: string | null;
  image_url?: string | null;
  image_scale?: number | null;
  show_donor_profile?: boolean | null;
  message_template?: string | null;
  text_color?: string | null;
  bg_color?: string | null;
  enable_card?: boolean | null;
  font_family?: string | null;
  font_size?: number | null;
  font_weight?: string | null;
  text_animation?: string | null;
  alert_animation?: string | null;
  donor_avatar?: string | null;
  text_delay?: number | null;
};

/** The fields the template and tier logic read off a tip. */
export type TemplateTip = Pick<
  Tip,
  "tipper_name" | "amount" | "currency" | "message"
>;

export function parseTemplate(template: string, tip: TemplateTip): string {
  return template
    .replace(/\{name\}/g, tip.tipper_name)
    .replace(/\{amount\}/g, tip.currency === "KHR"
      ? tip.amount.toLocaleString()
      : tip.amount.toFixed(2))
    .replace(/\{currency\}/g, tip.currency)
    .replace(/\{message\}/g, tip.message ?? "")
    .replace(/\{avatar\}/g, "");
}

/**
 * How much of a donor's message may be spoken, in characters.
 *
 * Synthesis is not free: measured against the running route on this machine,
 * the round trip is roughly flat to ~100 characters and then climbs about one
 * second per 30 more.
 *
 *     47 chars   7.7s
 *    108 chars   7.0s
 *    168 chars   8.5s
 *    228 chars   9.4s
 *    348 chars  12.0s
 *
 * `/api/tts/synthesize` budgets the WHOLE request -- the clone attempt and the
 * stock-voice retry -- at 10s, and the overlay aborts at 12s. A 300-character
 * donor message, which `POST /api/alerts/test` accepts today, lands between the
 * two. The route's clone attempt is cut off with nothing left for the retry, so
 * it answers after the overlay has already given up, and the overlay falls back
 * to the OS voice -- which on this box has no Khmer voice installed. The result
 * is that the longer the message, the more certainly the alert says nothing at
 * all. That is why a donor who wrote more was heard less.
 *
 * The cap is on the SPOKEN line only. The overlay still renders the message in
 * full underneath the alert, so nothing the donor wrote is hidden from the
 * stream -- it is simply not all read out.
 */
const MAX_SPOKEN_MESSAGE_CHARS = 120;

/**
 * Cuts `text` to `limit` characters, preferring a word boundary.
 *
 * A word boundary is cosmetic, not a nicety: a cut mid-word is pronounced as a
 * separate syllable, so the tail of the sentence comes out wrong.
 */
function clipToWords(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  // Only worth retreating to a boundary when one is close enough that we are
  // not throwing away most of the allowance to save a few characters.
  const body = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,.;:!?-]+$/, "")}…`;
}

/**
 * The line the alert speaks: the rendered acknowledgement, then the donor's own
 * message when the template does not already carry it.
 *
 * `parseTemplate` alone drops the message for any template without `{message}`,
 * which is what shipped: the donor's words never reached the voice. Appending
 * here rather than editing the creator's stored template keeps that content
 * theirs to change, and the placeholder check keeps a template that *does* use
 * `{message}` from being spoken twice.
 *
 * The donor's message is clipped to `MAX_SPOKEN_MESSAGE_CHARS` in both cases,
 * before it is rendered either way, because a `{message}` template carries the
 * same words by the same route and has the same budget problem. The clip is on
 * the SPOKEN line only: the overlay still renders the message in full beneath
 * the alert, so nothing the donor wrote is hidden from the stream.
 */
export function speechText(template: string, tip: TemplateTip): string {
  const message = clipToWords((tip.message ?? "").trim(), MAX_SPOKEN_MESSAGE_CHARS);
  if (!message) return parseTemplate(template, tip).trim();
  // Exactly the token `parseTemplate` substitutes, so the two agree: anything
  // parseTemplate leaves literal is not a placeholder, and must not silence the
  // donor's message.
  if (template.includes("{message}")) return parseTemplate(template, { ...tip, message }).trim();
  const acknowledgement = parseTemplate(template, tip).trim();
  return acknowledgement ? `${acknowledgement} ${message}` : message;
}

export function highlightText(text: string, highlightColor: string): string {
  return text.replace(
    /(\d[\d,\.]*\s*(?:USD|KHR|$|£|€)|[\$£€][\d,\.]+)/g,
    `<span style="color:${highlightColor};font-weight:800">$1</span>`
  );
}

/**
 * Chooses the tier for this donation: the highest minimum the tip clears, in
 * the tip's own currency. Minimums are stored per currency rather than
 * normalised to USD because the overlay has no reliable FX rate (the KHR rate
 * lives in localStorage on the dashboard, not in the database).
 *
 * Returns null when no tier matches, meaning "use the base settings".
 */
export function pickTier(
  tiers: AlertTier[],
  tip: TemplateTip,
): AlertTier | null {
  const eligible = tiers.filter((t) =>
    tip.currency === "KHR"
      ? Number(tip.amount) >= Number(t.min_amount_khr)
      : Number(tip.amount) >= Number(t.min_amount_usd),
  );
  if (eligible.length === 0) return null;

  const key = (t: AlertTier) =>
    tip.currency === "KHR" ? Number(t.min_amount_khr) : Number(t.min_amount_usd);

  return eligible.reduce((best, t) => (key(t) > key(best) ? t : best));
}

/**
 * Layers a tier's non-null fields over the base settings. The spread of `null`
 * is the point: an unconfigured tier field must fall through to the base value
 * rather than blanking it out.
 *
 * The two named branches below are redundant with the `key in merged` one --
 * both column names are also plain members of `AlertSettings`. They are kept
 * deliberately: `delay_seconds` vs `text_delay` is exactly the rename that
 * silently broke per-tier text delay in production, because an unrecognised key
 * is dropped here rather than raising. See the test that pins that behaviour.
 */
export function applyTier(
  settings: AlertSettings,
  tier: AlertTier | null,
): AlertSettings {
  if (!tier) return settings;
  const merged = { ...settings } as Record<string, unknown>;
  for (const [key, value] of Object.entries(tier)) {
    if (value === null || value === undefined) continue;
    if (key === "duration_seconds") {
      merged.duration_seconds = value as number;
    } else if (key === "text_delay") {
      merged.text_delay = value as number;
    } else if (key in merged) {
      merged[key] = value;
    }
  }
  return merged as AlertSettings;
}