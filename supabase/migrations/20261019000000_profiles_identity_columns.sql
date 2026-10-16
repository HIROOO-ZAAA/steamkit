-- StreamKit: profiles identity columns (fix szkematic gap)
-- The live "profiles" table was created before display_name / stream_title /
-- banner_url / role existed in the master supabase_schema.sql. Add them
-- idempotently and refresh the PostgREST schema cache.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists banner_url text,
  add column if not exists stream_title text default 'Live Stream Tipping & Alerts',
  add column if not exists role text default 'creator' check (role in ('creator', 'admin'));

-- Backfill display_name for existing rows from the legacy full_name column
-- (or username as a last resort) so creators keep their name.
update public.profiles
set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim(full_name), ''), username, '')
where display_name is null or trim(display_name) = '';

-- Refresh the PostgREST schema cache immediately so new columns are queryable.
select pg_notify('pgrst', 'reload schema');