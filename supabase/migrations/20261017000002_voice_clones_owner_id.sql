-- supabase/migrations/20261017000001_voice_clones_owner_id.sql
--
-- Brings the LIVE `voice_clones` to the shape the creator-facing code writes.
--
-- WHAT HAPPENED
--   Two migrations were pasted out of order. ..._voicestudio_backend_swap.sql
--   (which ADDS `voicestudio_voice_id`) was applied, but
--   ..._elevenlabs_voice_clones.sql (which renames `user_id` -> `owner_id`,
--   drops the storage columns and rewrites the RLS policies) was not. The live
--   table is therefore the ...011 shape plus one added column.
--
--   Probed against the live database on 2026-10-16: `user_id`, `label`,
--   `reference_audio_path`, `reference_transcript`, `consent_at`,
--   `duration_seconds`, `created_at` and `voicestudio_voice_id` exist;
--   `owner_id` does not (PostgREST even hints "Perhaps you meant ... user_id").
--
--   Every route that touches clones then failed, in this order:
--     1. `owner_id` does not exist           -> PostgREST 42703 on the insert
--     2. `reference_audio_path` is NOT NULL  -> 23502, and no code path writes it
--     3. the RLS policy is keyed on `user_id`, so after the rename below it
--        would raise 42703 on EVERY statement rather than merely be wrong
--     4. the VoxCPM trigger on voice_settings reads `voice_clones.user_id`, so
--        the rename would break every voice_settings write as well
--
--   Item 1 is why POST /api/voice-clones answered "Could not save that voice."
--   Items 2-4 are why fixing only item 1 would have moved the failure rather
--   than removed it.
--
-- WHY NOT "JUST PASTE ..._elevenlabs_voice_clones.sql"
--   That file also drops and recreates `streamkit_resolve_overlay` from a
--   snapshot of the function taken before the alert-tier rework. The live
--   function is the only authority on its own return type, and the overlay
--   reads those columns, so this file deliberately does not touch it. Only the
--   ownership work is needed, so it is done on its own.
--
-- Idempotent: pasting it twice is harmless.

-- ── 1. Ownership column ──────────────────────────────────────────────────────
do $migration$
begin
  -- ...011 shape -> this shape. Rename rather than add so the policies below
  -- cover one column instead of two.
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

alter table public.voice_clones
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- A row that cannot name its owner is unreachable by every code path: RLS hides
-- it and the synthesis route can never match it. Refuse to finish rather than
-- leave a nullable column that silently loses rows.
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

-- ── 2. The storage columns are vestigial ─────────────────────────────────────
-- Samples are never stored here any more: the file goes to VoiceStudio and only
-- the returned profile id is kept, so there is no path to record and no bucket
-- to point it at. `reference_audio_path` being NOT NULL is why the insert needs
-- this even though nothing writes the column.
--
-- The constraint is relaxed rather than the column dropped, because this cannot
-- see the rows (RLS hides them from the client) and dropping would destroy data
-- on a guess. Once the table is known to hold only rows written by the current
-- routes, finish the job with:
--   alter table public.voice_clones
--     drop column reference_audio_path,
--     drop column reference_transcript;
--
-- Conditional because `drop not null` has no `if exists` form, and a plain
-- statement would abort the whole paste on a database that already dropped it.
do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_clones'
      and column_name = 'reference_audio_path'
  ) then
    alter table public.voice_clones alter column reference_audio_path drop not null;
  end if;
end
$migration$;

-- ── 3. RLS: every existing policy keys on the column that just went away ─────
-- A policy that names a missing column is not "too permissive", it raises on
-- every statement. Dropped by shape rather than by name so a hand-edited policy
-- cannot survive the rename.
alter table public.voice_clones enable row level security;

grant select, insert, update, delete on table public.voice_clones to authenticated;

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

-- ── 4. Retire the VoxCPM ownership trigger ───────────────────────────────────
-- ...011 installed a BEFORE trigger on voice_settings that reads
-- `voice_clones.user_id`. After the rename above that function raises on every
-- voice_settings insert/update, so it goes regardless of the columns above.
drop trigger if exists voice_settings_own_clone on public.voice_settings;
drop function if exists public.streamkit_assert_own_voice_clone();