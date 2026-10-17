-- Per-currency tip page settings, payment method preference, and public merchant links.
-- Until this migration runs, the dashboard tips page falls back to tip_settings only.

ALTER TABLE public.creator_tip_settings
  ADD COLUMN IF NOT EXISTS usd_presets numeric[] DEFAULT '{0.05,1,2.5,5,50}',
  ADD COLUMN IF NOT EXISTS khr_presets numeric[] DEFAULT '{500,4000,20000,50000,100000}',
  ADD COLUMN IF NOT EXISTS usd_max_amount numeric,
  ADD COLUMN IF NOT EXISTS khr_max_amount numeric,
  ADD COLUMN IF NOT EXISTS usd_payment_method text DEFAULT 'aba_payway',
  ADD COLUMN IF NOT EXISTS khr_payment_method text DEFAULT 'bakong',
  ADD COLUMN IF NOT EXISTS aba_link_usd text,
  ADD COLUMN IF NOT EXISTS aba_link_khr text,
  ADD COLUMN IF NOT EXISTS bakong_id text;

-- Seed per-currency presets from the single-currency tip_settings row.
UPDATE public.creator_tip_settings c
SET usd_presets = t.suggested_amounts
FROM public.tip_settings t
WHERE t.user_id = c.creator_id
  AND t.currency = 'USD'
  AND t.suggested_amounts IS NOT NULL;

UPDATE public.creator_tip_settings c
SET khr_presets = t.suggested_amounts
FROM public.tip_settings t
WHERE t.user_id = c.creator_id
  AND t.currency = 'KHR'
  AND t.suggested_amounts IS NOT NULL;
