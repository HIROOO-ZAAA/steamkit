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