-- Voice cloning for alert read-aloud.
--
-- Until now the OBS overlay could only speak through the Web Speech API:
--   src/app/overlay/alerts/page.tsx -> resolveVoice() looks up a
--   SpeechSynthesisVoice from the host OS. That is a lookup, not synthesis --
--   it cannot clone anything, and on a stock Windows install there is often no
--   Khmer voice at all, so `utterance.lang = "km-KH"` silently falls back to
--   whatever English voice exists.
--
-- This migration adds the data half of a real engine: a creator records a
-- reference clip, it is stored privately, and the overlay asks a local
-- VoxCPM2 process (scripts/voxcpm-server.py) to synthesise the alert with it.
--
-- ENGINE, NOT PROVIDER
--   `voice_settings.provider` already existed and has exactly one value,
--   'browser'. It is kept and still means "the OS speech engine". The new
--   `tts_engine` column is the switch that actually chooses between the two
--   worlds, and it defaults to 'browser' so an existing creator who applies
--   this migration without touching the dashboard changes nothing at all.
--
-- FALLBACK IS ON BY DEFAULT
--   The model runs on the creator's own GPU. If it is not running, or is still
--   loading, the alert must still make a sound. `clone_fallback` defaults to
--   true, which sends the text to the Web Speech API instead. A silent alert
--   reads as a broken overlay, and a robotic one does not.
--
-- THE REFERENCE CLIP IS PRIVATE
--   Unlike `donation-voice`, this bucket is NOT public. A creator's own voice
--   is biometric data; it is fetched by the service role (the upload route and
--   the local TTS server) and never served from a Supabase domain. Presets
--   need no audio at all -- they are VoxCPM "Voice Design" style prompts, so
--   no third-party voice is redistributed either.

-- ── Voice clones ─────────────────────────────────────────────────────────────
-- The owning column is `owner_id`, not `user_id`.
--
-- This file originally created the table with `user_id` and then built its RLS
-- policy and its ownership trigger on that name. But every migration before it
-- in filename order -- 20261017000000_elevenlabs_voice_clones and
-- 20261017000001_voice_clones_owner_id -- renames the column to `owner_id`, and
-- so does the live database. So `create table if not exists` here was already a
-- no-op against a table that had `owner_id`, and the two statements after it
-- then referenced a column that does not exist:
--
--   42703 column "user_id" does not exist
--
-- A policy naming a missing column raises that on EVERY statement touching the
-- table, not only on creation, and no later migration repairs it. The same
-- mismatch in the trigger body below made every write to `voice_settings` fail.
create table if not exists public.voice_clones (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  -- Creator-facing name, e.g. "My streamer voice". Never used as a path.
  label text not null,
  -- Object path inside the private `voice-clones` bucket. Generated, never
  -- supplied by the client.
  reference_audio_path text not null,
  -- Optional. Supplying the exact transcript of the clip unlocks VoxCPM's
  -- "ultimate cloning" mode, which reproduces timbre, rhythm and emotion far
  -- more faithfully than reference audio alone.
  reference_transcript text,
  -- When the creator ticked the consent box. A clone row without this is not
  -- usable; the API refuses to serve it.
  consent_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.voice_clones enable row level security;

grant select, insert, update, delete on table public.voice_clones to authenticated;

drop policy if exists "Users manage own voice clones" on public.voice_clones;
create policy "Users manage own voice clones"
  on public.voice_clones
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- One clone per id, obviously, and a creator cannot point `voice_settings`
-- at somebody else's row: the foreign key below has no ownership condition of
-- its own, so it is enforced here by trigger instead. Without this a creator
-- could set `active_clone_id` to any uuid and read another creator's voice
-- through the synthesis route.
create or replace function public.streamkit_assert_own_voice_clone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.active_clone_id is not null and not exists (
    select 1 from public.voice_clones as clones
    where clones.id = new.active_clone_id
      and clones.owner_id = new.user_id
  ) then
    raise exception 'voice clone does not belong to this creator'
      using errcode = '42501';
  end if;
  return new;
end
$function$;

drop trigger if exists voice_settings_own_clone on public.voice_settings;
create trigger voice_settings_own_clone
  before insert or update on public.voice_settings
  for each row execute function public.streamkit_assert_own_voice_clone();

-- ── Engine selection ─────────────────────────────────────────────────────────
-- `provider` is left untouched for backwards compatibility; it keeps meaning
-- "browser". These four columns are what the new feature reads.
alter table public.voice_settings
  add column if not exists tts_engine text not null default 'browser',
  add column if not exists active_clone_id uuid,
  add column if not exists preset_id text,
  add column if not exists clone_fallback boolean not null default true;

alter table public.voice_settings
  drop constraint if exists voice_settings_tts_engine_check;
alter table public.voice_settings
  add constraint voice_settings_tts_engine_check
  check (tts_engine in ('browser', 'voxcpm'));

-- `preset_id` must be one of the ids the app actually ships. An unknown value
-- is rejected here rather than reaching VoxCPM as an empty style prompt, which
-- would silently produce a generic voice instead of an error.
alter table public.voice_settings
  drop constraint if exists voice_settings_preset_check;
alter table public.voice_settings
  add constraint voice_settings_preset_check
  check (
    preset_id is null or preset_id in (
      'warm_female', 'energetic_male', 'calm_anchor',
      'bright_teen', 'storyteller_grandma', 'custom'
    )
  );

-- A clone and a preset are alternatives. Keeping both set would leave the
-- precedence ambiguous at the call site, so only one may be chosen.
alter table public.voice_settings
  drop constraint if exists voice_settings_voice_source_check;
alter table public.voice_settings
  add constraint voice_settings_voice_source_check
  check (not (active_clone_id is not null and preset_id is not null));

-- ── Private storage bucket ───────────────────────────────────────────────────
-- Not public, unlike `donation-voice`. Reached only by the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-clones',
  'voice-clones',
  false,
  20000000,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created on purpose. With the bucket private
-- and every access going through the service role, RLS has nothing to grant;
-- adding an authenticated SELECT policy here would expose the reference clip
-- to any signed-in user who could guess the path.

-- ── Expose the engine to the overlay ─────────────────────────────────────────
-- The overlay needs to know which engine to use and which voice to ask for.
-- New OUT columns, so the explicit DROP is required, not defensive:
-- CREATE OR REPLACE cannot change a function's return type (PostgreSQL 42P13).
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
  voice_intro_template text,
  tts_engine text,
  active_clone_id uuid,
  preset_id text,
  clone_fallback boolean
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
    -- jsonb_agg over zero rows is NULL, and the overlay calls `tiers.filter()`
    -- on this without a guard, so an empty tier list must stay an array.
    coalesce((
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
          'alert_animation', ts.alert_animation,
          'text_delay', ts.text_delay,
          'donor_avatar', ts.donor_avatar,
          'configured', (ts.id is not null)
        )
        order by t.sort_order, t.min_amount_usd
      )
      from public.alert_tiers as t
      left join public.alert_settings as ts on ts.tier_id = t.id
      where t.user_id = credentials.creator_id
    ), '[]'::jsonb),
    coalesce(intro.enabled, false),
    coalesce(intro.template, '{name} sent a voice message'),
    -- Clamping here means a creator cannot point the overlay at an engine
    -- value that no code path handles; an unusable engine degrades to the
    -- browser voice rather than to silence.
    case when voices.tts_engine = 'voxcpm' then 'voxcpm' else 'browser' end,
    voices.active_clone_id,
    voices.preset_id,
    coalesce(voices.clone_fallback, true)
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