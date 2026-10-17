-- Donor voice messages.
--
-- The alerts dashboard has had a "VOICE MESSAGE INTRO" control since
-- 20261019000007_alerts_tiers.sql: it writes `alert_voice_intro.enabled` and
-- `alert_voice_intro.template`, and `streamkit_resolve_overlay` returns both.
-- Nothing ever read them, because donors had no way to send a voice message
-- in the first place. This migration adds the missing data path.
--
-- MEDIA MOVES donation -> tips VIA A TRIGGER, NOT AT EVERY INSERT SITE
--   `tips` rows are created from at least four different places: the ABA
--   PayWay completion RPC, the Bakong/KHQR completion RPC, the
--   telegram_aba_notifications trigger, and the creator test-alert RPC. Each
--   one would otherwise need its own copy of the same media columns. A
--   BEFORE INSERT trigger derives them from the linked donation instead, so
--   every path picks the media up automatically and none can forget.
--
-- PLAYED IMMEDIATELY, NOT MODERATED
--   Donation photos are held at `pending` and only render once the creator
--   approves them, because a photo sits on screen for the whole alert
--   duration. A voice message is short and the creator explicitly opts in
--   via the intro toggle, so it plays as part of the alert. Upload-time
--   validation (see src/app/api/donation-voice/route.ts) is the guard rail.
--
-- MEDIA IS CARRIED, NEVER RENDERED AS MARKUP
--   Only the object *path* is stored. The overlay builds the public URL from
--   it, so a path can never become arbitrary markup or an off-site image.

-- ── Backfill: photo columns that live code already depends on ────────────────
-- src/lib/types.ts references 20261019000003_donation_photo_moderation.sql,
-- but that file was never written to disk; `photo_path` / `photo_status` were
-- applied straight to the project. Declaring them here (idempotently) makes a
-- fresh environment match the live one.
alter table public.donations
  add column if not exists photo_path text,
  add column if not exists photo_status text not null default 'none';

alter table public.tips
  add column if not exists photo_path text,
  add column if not exists photo_status text not null default 'none';

-- NOT VALID: rows written before this migration are not re-checked, so adding
-- the constraint cannot fail on an existing table that holds older statuses.
alter table public.donations
  drop constraint if exists donations_photo_status_check;
alter table public.donations
  add constraint donations_photo_status_check
  check (photo_status in ('pending', 'approved', 'rejected', 'none')) not valid;

alter table public.tips
  drop constraint if exists tips_photo_status_check;
alter table public.tips
  add constraint tips_photo_status_check
  check (photo_status in ('pending', 'approved', 'rejected', 'none')) not valid;

-- ── Voice columns ───────────────────────────────────────────────────────────
-- `voice_duration_seconds` is advisory only: the overlay plays the clip and
-- trusts the file, but the creator dashboard shows it without decoding audio.
alter table public.donations
  add column if not exists voice_path text,
  add column if not exists voice_duration_seconds integer
    check (voice_duration_seconds is null or voice_duration_seconds between 1 and 30);

alter table public.tips
  add column if not exists voice_path text,
  add column if not exists voice_duration_seconds integer
    check (voice_duration_seconds is null or voice_duration_seconds between 1 and 30);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Public read so the OBS overlay can fetch it without credentials, matching
-- how `donation-photos` is served. Uploads go through the service-role route
-- handler, so no anon insert policy is granted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'donation-voice',
  'donation-voice',
  true,
  1500000,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Copy donation media onto every tip that carries it ──────────────────────
create or replace function public.streamkit_tips_copy_donation_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_donation public.donations%rowtype;
begin
  if new.payment_transaction_id is null then
    return new;
  end if;

  -- A tip may have several transactions against one donation (retries); the
  -- donation is the same either way, so picking one is safe.
  select d.* into v_donation
  from public.payment_transactions as p
  join public.donations as d on d.id = p.donation_id
  where p.id = new.payment_transaction_id
  limit 1;

  if not found then
    return new;
  end if;

  -- Only fill blanks: a path already set on the tip wins, so a manual
  -- correction by the creator is never overwritten.
  new.photo_path := coalesce(new.photo_path, v_donation.photo_path);
  new.photo_status := case
    when new.photo_path is not null and new.photo_path = v_donation.photo_path
      then v_donation.photo_status
    else new.photo_status
  end;

  new.voice_path := coalesce(new.voice_path, v_donation.voice_path);
  new.voice_duration_seconds := coalesce(
    new.voice_duration_seconds,
    v_donation.voice_duration_seconds
  );

  return new;
end
$function$;

drop trigger if exists tips_copy_donation_media on public.tips;
create trigger tips_copy_donation_media
  before insert on public.tips
  for each row execute function public.streamkit_tips_copy_donation_media();

-- ── Overlay polling path needs the media columns too ────────────────────────
-- The realtime channel delivers whole rows, so the overlay already saw
-- photo_path that way. The 3s poll in src/app/overlay/alerts/page.tsx uses this
-- RPC, and it returned none of the media columns -- so a photo or voice
-- message would silently vanish whenever realtime was blocked or reconnected.
-- Returns different columns, so CREATE OR REPLACE alone is rejected with
-- 42P13 ("cannot change return type of existing function"). The explicit DROP
-- is required, not defensive: adding OUT parameters to an existing function
-- always needs it.
drop function if exists public.streamkit_recent_alerts(text, timestamptz);

create function public.streamkit_recent_alerts(p_token text, p_since timestamptz)
returns table (
  id uuid,
  tipper_name text,
  amount numeric,
  currency text,
  message text,
  payment_status text,
  created_at timestamptz,
  photo_path text,
  photo_status text,
  voice_path text,
  voice_duration_seconds integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
begin
  select credentials.creator_id into v_creator
  from public.streamkit_overlay_credentials as credentials
  where credentials.token = p_token;

  if v_creator is null then
    return;
  end if;

  return query
  select
    t.id,
    t.tipper_name,
    t.amount,
    t.currency,
    t.message,
    t.payment_status,
    t.created_at,
    t.photo_path,
    t.photo_status,
    t.voice_path,
    t.voice_duration_seconds
  from public.tips as t
  where t.creator_id = v_creator
    and t.payment_status in ('successful', 'test')
    and t.created_at > p_since
  order by t.created_at asc
  limit 10;
end
$function$;

revoke all on function public.streamkit_recent_alerts(text, timestamptz) from public;
grant execute on function public.streamkit_recent_alerts(text, timestamptz) to anon, authenticated;
