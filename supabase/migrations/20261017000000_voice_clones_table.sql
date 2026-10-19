-- ElevenLabs voice clones
--
-- Re-points `voice_clones` at the ElevenLabs hosted-clone flow that replaced the
-- local VoxCPM sidecar. The audio never lands in Supabase Storage: the sample is
-- forwarded to ElevenLabs and only the resulting `voice_id` is kept here.
--
-- This migration is written to be safe in three different database states, which
-- is not hypothetical -- see the note below.
--
--   1. `voice_clones` never existed (migration ...011 was never pasted).
--   2. `voice_clones` exists in the ...011 shape: `user_id`,
--      `reference_audio_path`, `consent_at ... not null default now()`.
--   3. `voice_clones` was dropped by ...001_remove_voice_cloning.sql, which is
--      NOT on disk. PROJECT_MEMORY.md records it as applied, but migrations in
--      this repo are pasted by hand, so the live database is the only authority.
--
-- Every branch is idempotent, so pasting this twice is harmless.

-- ── Table ─────────────────────────────────────────────────────────────────────
create table if not exists public.voice_clones (
  id uuid default gen_random_uuid() primary key,
  -- Named `owner_id` rather than `user_id` because the creator-facing code
  -- selects on it directly and the rename below is only cheap while the table
  -- is small. See the rename block below for the ...011 -> here transition.
  owner_id uuid references auth.users(id) on delete cascade not null,
  label text not null,
  -- ElevenLabs' identifier for the cloned voice. Null until the provider
  -- accepts the sample, which is why the UI shows "Pending consent".
  elevenlabs_voice_id text,
  -- Null means the sample has not cleared review/consent and the synthesis
  -- route refuses to use the row. Deliberately nullable, unlike ...011.
  consent_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

do $migration$
begin
  -- ...011 shape -> this shape. Rename rather than add so the RLS policies below
  -- do not have to cover two ownership columns.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_clones'
      and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_clones'
      and column_name = 'owner_id'
  ) then
    alter table public.voice_clones rename column user_id to owner_id;
  end if;
end
$migration$;

alter table public.voice_clones add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.voice_clones add column if not exists label text;
alter table public.voice_clones add column if not exists elevenlabs_voice_id text;
alter table public.voice_clones add column if not exists consent_at timestamptz;
alter table public.voice_clones add column if not exists created_at timestamptz not null default timezone('utc'::text, now());

-- `consent_at` must be able to stay null: the badge in the voice library reads a
-- null as "Pending consent", and the synthesis route refuses such a row. The
-- ...011 default of `now()` made every row look consented the instant it landed.
alter table public.voice_clones drop column if exists reference_audio_path;
alter table public.voice_clones drop column if exists reference_transcript;

-- `user_id` only still exists if the rename above was skipped (both columns
-- present), so this backfill must be conditional rather than unconditional:
-- an unconditional reference to a dropped column aborts the whole migration.
alter table public.voice_clones alter column owner_id drop not null;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_clones'
      and column_name = 'user_id'
  ) then
    update public.voice_clones set owner_id = user_id where owner_id is null;
  end if;
end
$migration$;

do $migration$
declare
  orphans int;
begin
  select count(*) into orphans from public.voice_clones where owner_id is null;
  if orphans > 0 then
    raise exception
      'voice_clones has % row(s) with no resolvable owner; delete them before re-running',
      orphans;
  end if;
end
$migration$;

alter table public.voice_clones alter column owner_id set not null;
alter table public.voice_clones alter column label set not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.voice_clones enable row level security;

grant select, insert, update, delete on table public.voice_clones to authenticated, service_role;

-- The ...011 policy is keyed on `user_id`, which no longer exists. It would not
-- merely be wrong, it would raise on every statement. Drop by name and by shape.
drop policy if exists "Users manage own voice clones" on public.voice_clones;
drop policy if exists "Users manage own clones" on public.voice_clones;

do $migration$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'voice_clones'
  loop
    execute format('drop policy if exists %I on public.voice_clones', pol.policyname);
  end loop;
end
$migration$;

create policy "Users manage own voice clones"
  on public.voice_clones
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── Retire the VoxCPM ownership trigger ───────────────────────────────────────
-- ...011 installed a BEFORE trigger on voice_settings that reads
-- `voice_clones.user_id`. After the rename above that function would fail on
-- every voice_settings write, so it goes regardless of whether the ...011 columns
-- are still present.
drop trigger if exists voice_settings_own_clone on public.voice_settings;
drop function if exists public.streamkit_assert_own_voice_clone();

-- ElevenLabs supersedes the engine/preset/clone-fallback columns ...011 added.
-- Left in place rather than dropped: the overlay still reads `provider`, and
-- these are inert without the sidecar. A later migration can remove them once
-- the live schema is confirmed.

-- ── Private cache bucket for synthesised audio ────────────────────────────────
-- Cached TTS lives here, not in `donation-voice`. That bucket is PUBLIC and holds
-- donor recordings; mixing creator voice clones into it would put biometric
-- audio on a public Supabase domain.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tts-cache', 'tts-cache', false, 5000000)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- No storage.objects policies: private bucket, service role only.

-- ── Overlay access ────────────────────────────────────────────────────────────
-- The overlay is anonymous and authenticates with a token, not a session, so the
-- synthesis route resolves the creator from `streamkit_overlay_credentials`
-- rather than from auth.uid().
--
-- This deliberately does NOT expose the creator's clone ids. The route takes an
-- optional `voiceCloneId` and reads the row itself with the service role, then
-- checks `.eq("owner_id", creatorId)`. That check has to live in the route: an
-- array of provider voice ids handed to an anonymous overlay is data no
-- client-side caller should be selecting from.
--
-- There is also no active_clone_id. The voice library has no "use this" control
-- to store it in, so a creator without a clone id falls back to the stock voice.
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
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated, service_role;