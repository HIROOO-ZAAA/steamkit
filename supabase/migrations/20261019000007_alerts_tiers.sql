-- Alert tiers.
--
-- Until now `alert_settings` was one row per creator, and the "SELECT SETTING
-- PROFILE" dropdown in the alerts dashboard had two hardcoded options and a
-- `+ NEW` button that saved nowhere. This adds real tiers.
--
-- MODEL
--   * A creator's `alert_settings` row with `tier_id is null` is the BASE row:
--     the default alert, used when no tier matches.
--   * Each row in `alert_tiers` may have a matching `alert_settings` row
--     carrying the per-tier overrides.
--   * Minimums are stored per currency (usd + khr) rather than a single number.
--     This matches the existing `creator_tip_settings.min_amount_usd/khr`
--     convention and avoids doing an FX conversion to pick a tier, which the
--     overlay cannot reliably do because the KHR rate lives in localStorage.
--
-- TIER SELECTION
--   The overlay resolves its config once every 4s and then fires many alerts
--   from that snapshot, so a tier cannot be chosen server-side without knowing
--   the donation amount. Instead the RPC returns every tier as a `tiers` jsonb
--   array and the overlay picks the best match per tip, client-side. That keeps
--   tier selection synchronous with the alert -- no extra round trip, no race.
--
-- WHY THE JOIN BELOW IS PINNED TO tier_id IS NULL
--   The left join onto alert_settings used to be `on user_id = creator_id`,
--   which was safe only because user_id was unique. Now that one creator can
--   have many rows, an unpinned join would multiply the function's result set
--   and break the overlay's single-row read.

create table if not exists public.alert_tiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  min_amount_usd numeric(12,2) not null default 1.00 check (min_amount_usd >= 0),
  min_amount_khr numeric(12,2) not null default 4000 check (min_amount_khr >= 0),
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, name)
);

alter table public.alert_tiers enable row level security;

grant select, insert, update, delete on table public.alert_tiers to authenticated;

drop policy if exists "Users manage own alert tiers" on public.alert_tiers;
create policy "Users manage own alert tiers"
  on public.alert_tiers
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Voice message intro, stored ONCE per creator.
--
-- The product behaviour we want is "edit the intro template on the $0.50 tier
-- and it also applies to $1.00, $0.01 and every other tier". Write-through
-- across N rows can drift if one write fails halfway. A single per-creator row
-- gives the same behaviour with zero drift by construction -- there is only one
-- copy, so every tier necessarily reads the same value.
--
-- It is deliberately independent of `alert_settings.tts_enabled`: turning the
-- main TTS off must not silence voice-message intros.
create table if not exists public.alert_voice_intro (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  template text not null default '{name} sent a voice message',
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.alert_voice_intro enable row level security;

grant select, insert, update on table public.alert_voice_intro to authenticated;

drop policy if exists "Users manage own voice intro" on public.alert_voice_intro;
create policy "Users manage own voice intro"
  on public.alert_voice_intro
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Link settings rows to tiers.
alter table public.alert_settings
  add column if not exists tier_id uuid references public.alert_tiers(id) on delete cascade;

-- One row per (creator, tier). The base row is tier_id null.
alter table public.alert_settings drop constraint if exists alert_settings_user_id_key;
drop index if exists public.alert_settings_user_id_key;

create unique index if not exists alert_settings_creator_tier_key
  on public.alert_settings (user_id, (coalesce(tier_id, '00000000-0000-0000-0000-000000000000'::uuid)));

drop function if exists public.streamkit_resolve_overlay(text);

create function public.streamkit_resolve_overlay(p_token text)
returns table (
  creator_id uuid,
  duration_seconds integer,
  sound_url text,
  animation_type text,
  font_color text,
  tts_enabled boolean,
  language text,
  pitch numeric,
  speed numeric,
  layout text,
  image_url text,
  image_scale integer,
  show_donor_profile boolean,
  message_template text,
  text_color text,
  bg_color text,
  enable_card boolean,
  font_family text,
  font_size integer,
  font_weight text,
  text_animation text,
  alert_animation text,
  text_delay integer,
  donor_avatar text,
  provider text,
  voice_id text,
  cloned_voice_id text,
  cloning_enabled boolean,
  tiers jsonb,
  voice_intro_enabled boolean,
  voice_intro_template text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    credentials.creator_id,
    coalesce(alerts.duration_seconds, 6),
    coalesce(alerts.sound_url, 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'),
    coalesce(alerts.animation_type, 'bounce'),
    coalesce(alerts.font_color, '#10b981'),
    coalesce(alerts.tts_enabled, true),
    coalesce(voices.language, 'km-KH'),
    coalesce(voices.pitch, 1.0),
    coalesce(voices.speed, 1.0),
    coalesce(alerts.layout, 'image_top'),
    alerts.image_url,
    coalesce(alerts.image_scale, 50),
    coalesce(alerts.show_donor_profile, true),
    coalesce(alerts.message_template, 'Thank you {name} for {amount}{currency}'),
    coalesce(alerts.text_color, '#ffffff'),
    coalesce(alerts.bg_color, '#000000'),
    coalesce(alerts.enable_card, false),
    coalesce(alerts.font_family, '''Noto Sans Khmer'', sans-serif'),
    coalesce(alerts.font_size, 36),
    coalesce(alerts.font_weight, '700'),
    coalesce(alerts.text_animation, 'wiggle'),
    coalesce(alerts.alert_animation, 'bounceIn'),
    coalesce(alerts.text_delay, 0),
    coalesce(alerts.donor_avatar, '🦔'),
    coalesce(voices.provider, 'browser'),
    voices.voice_id,
    voices.cloned_voice_id,
    coalesce(voices.cloning_enabled, false),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'tier_id', t.id,
            'name', t.name,
            'min_amount_usd', t.min_amount_usd,
            'min_amount_khr', t.min_amount_khr,
            'sort_order', t.sort_order,
            'duration_seconds', ts.duration_seconds,
            'sound_url', ts.sound_url,
            'font_color', ts.font_color,
            'tts_enabled', ts.tts_enabled,
            'layout', ts.layout,
            'image_url', ts.image_url,
            'image_scale', ts.image_scale,
            'show_donor_profile', ts.show_donor_profile,
            'message_template', ts.message_template,
            'text_color', ts.text_color,
            'bg_color', ts.bg_color,
            'enable_card', ts.enable_card,
            'font_family', ts.font_family,
            'font_size', ts.font_size,
            'font_weight', ts.font_weight,
            'text_animation', ts.text_animation,
            'alert_seconds', ts.duration_seconds,
            'delay_seconds', ts.text_delay,
            'alert_animation', ts.alert_animation,
            'donor_avatar', ts.donor_avatar,
            'configured', (ts.id is not null)
          )
          order by t.sort_order, t.min_amount_usd
        )
        from public.alert_tiers as t
        left join public.alert_settings as ts on ts.tier_id = t.id
        where t.user_id = credentials.creator_id
      ),
      '[]'::jsonb
    ),
    coalesce(intro.enabled, false),
    coalesce(intro.template, '{name} sent a voice message')
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts
    on alerts.user_id = credentials.creator_id
   and alerts.tier_id is null
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  left join public.alert_voice_intro as intro on intro.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated;