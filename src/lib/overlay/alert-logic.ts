import type { Tip } from "@/lib/types";

/** Alert visuals are intentionally brief; speech continues after they fade. */
export const ALERT_DURATION_SECONDS = 2;

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
  tts_volume?: number;
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
  tts_volume?: number | null;
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

const MAX_SPEECH_CHUNK_CHARS = 110;

/** Split speech into bounded requests, preferring sentence and word boundaries. */
export function splitSpeechText(text: string, limit = MAX_SPEECH_CHUNK_CHARS): string[] {
  let remaining = text.trim();
  if (!remaining) return [];
  const chunks: string[] = [];

  while (remaining.length > limit) {
    const sentenceCut = Math.max(
      remaining.lastIndexOf(". ", limit),
      remaining.lastIndexOf("! ", limit),
      remaining.lastIndexOf("? ", limit),
      remaining.lastIndexOf("។ ", limit),
    );
    const cut = sentenceCut >= 0
      ? Math.min(limit, sentenceCut + 1)
      : remaining.lastIndexOf(" ", limit);
    let unicodeSafeCut = 0;
    for (const point of Array.from(remaining)) {
      if (unicodeSafeCut + point.length > limit) break;
      unicodeSafeCut += point.length;
    }
    const safeCut = cut >= limit * 0.55 ? cut : unicodeSafeCut;
    const chunk = remaining.slice(0, safeCut).trim();
    if (!chunk) break;
    chunks.push(chunk);
    remaining = remaining.slice(safeCut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * The complete line the alert speaks: the rendered acknowledgement, then the
 * donor's own message when the template does not already carry it.
 *
 * `parseTemplate` alone drops the message for any template without `{message}`,
 * which is what shipped: the donor's words never reached the voice. Appending
 * here rather than editing the creator's stored template keeps that content
 * theirs to change, and the placeholder check keeps a template that *does* use
 * `{message}` from being spoken twice.
 *
 * Long lines are split into bounded synthesis requests by `splitSpeechText`;
 * the spoken text itself remains complete.
 */
export function speechText(template: string, tip: TemplateTip): string {
  const message = (tip.message ?? "").trim();
  const numericAmount = Number(tip.amount);
  const speechAmount = tip.currency === "KHR"
    ? Math.round(numericAmount).toLocaleString("en-US")
    : numericAmount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const isKhmer = /[\u1780-\u17ff]/.test(template);
  const currencyName = tip.currency === "KHR"
    ? isKhmer ? "រៀល" : "riel"
    : isKhmer ? "ដុល្លារ" : Math.abs(numericAmount) === 1 ? "dollar" : "dollars";
  const amountToken = "__STREAMKIT_SPOKEN_AMOUNT__";
  const currencyToken = "__STREAMKIT_SPOKEN_CURRENCY__";
  const hasCurrencyReference = /\{currency\}|\b(?:USD|KHR|dollars?|riel)\b|ដុល្លារ|រៀល/i.test(template);
  const spokenTemplate = template
    .replace(/\{amount\}\s*\{currency\}/g, `${amountToken} ${currencyToken}`)
    .replace(/\{currency\}|\b(?:USD|KHR)\b/gi, currencyToken)
    .replace(/\{amount\}/g, hasCurrencyReference ? amountToken : `${amountToken} ${currencyToken}`);
  const renderSpokenTemplate = (value: TemplateTip) =>
    parseTemplate(spokenTemplate, value)
      .replaceAll(amountToken, speechAmount)
      .replaceAll(currencyToken, currencyName);
  if (!message) return renderSpokenTemplate(tip).trim();
  // Keep the alert acknowledgement first even when a creator put {message}
  // somewhere in the middle of their template. This guarantees the requested
  // donor -> amount -> viewer message order and prevents speaking it twice.
  const acknowledgement = renderSpokenTemplate({ ...tip, message: "" })
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[,;:]\s*$/, "")
    .trim();
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
 * Chooses a test amount that exercises the tier currently selected in the
 * dashboard. Without this, TEST's preview amount can cross a different tier
 * threshold and OBS correctly applies that other tier's duration/template.
 */
export function amountForTierTest(
  selectedAmount: number,
  currency: "USD" | "KHR",
  targetTierId: string | null,
  tiers: AlertTier[],
): number {
  const step = currency === "KHR" ? 1 : 0.01;
  const threshold = (item: AlertTier) => Number(
    currency === "KHR" ? item.min_amount_khr : item.min_amount_usd,
  );
  const ordered = [...tiers].sort((a, b) =>
    threshold(a) - threshold(b) || a.sort_order - b.sort_order,
  );
  const normalizedAmount = Number.isFinite(selectedAmount) && selectedAmount > 0
    ? selectedAmount
    : currency === "KHR" ? 1000 : 10;

  if (targetTierId === null) {
    const firstTierMinimum = ordered.length > 0 ? threshold(ordered[0]!) : null;
    if (firstTierMinimum === null) return normalizedAmount;
    // Use a positive amount just below the first tier threshold. If a tier
    // starts at zero, no positive donation can target base settings.
    const baseMax = Math.max(step, firstTierMinimum - step);
    return Math.min(normalizedAmount, baseMax);
  }

  const targetIndex = ordered.findIndex((item) => item.tier_id === targetTierId);
  if (targetIndex < 0) return normalizedAmount;
  const targetMinimum = Math.max(step, threshold(ordered[targetIndex]!));
  const nextHigherMinimum = ordered
    .slice(targetIndex + 1)
    .map(threshold)
    .find((minimum) => minimum > threshold(ordered[targetIndex]!));
  const targetMaximum = nextHigherMinimum === undefined
    ? Number.POSITIVE_INFINITY
    : nextHigherMinimum - step;

  // Duplicate adjacent thresholds cannot be uniquely selected by donation
  // amount; choosing their shared minimum lets pickTier's stable ordering win.
  if (targetMaximum < targetMinimum) return targetMinimum;
  return Math.min(Math.max(normalizedAmount, targetMinimum), targetMaximum);
}

/** Test clicks always exercise speech; real donations obey the saved TTS toggle. */
export function shouldSpeakAlert(ttsEnabled: boolean, isTestAlert: boolean): boolean {
  return ttsEnabled || isTestAlert;
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
