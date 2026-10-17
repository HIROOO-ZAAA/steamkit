-- StreamKit: profiles identity columns
--
-- The master supabase_schema.sql creates profiles with username and
-- display_name but NOT full_name. The LIVE database has a legacy full_name
-- column that no file in this repository creates, so the backfill below was
-- written against a column that only exists on production.
--
-- On any database rebuilt from the schema, that statement raised
--   42701 column "full_name" does not exist
-- and aborted the paste -- taking every migration after it with it, because a
-- failed paste is a transaction that rolls back.
--
-- The reference is now made inside a DO block and reached with EXECUTE, so the
-- SQL is only parsed on the branch where the column is actually present. A
-- static reference inside a plpgsql body is resolved at execution time, not at
-- DO-block creation time, so the missing-column case must never be written out
-- literally.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists banner_url text,
  add column if not exists stream_title text default 'Live Stream Tipping & Alerts',
  add column if not exists role text default 'creator' check (role in ('creator', 'admin'));

-- Backfill display_name for existing rows, preferring a name already set, then
-- the legacy full_name where it exists, then username.
do $migration$
declare
  v_has_full_name boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  ) into v_has_full_name;

  if v_has_full_name then
    -- Quoted literals: this string is re-parsed by EXECUTE, so every single
    -- quote inside it has to be doubled.
    execute $sql$
      update public.profiles
      set display_name = coalesce(
        nullif(trim(display_name), ''''),
        nullif(trim(full_name), ''''),
        username,
        ''''
      )
      where display_name is null or trim(display_name) = ''''
    $sql$;
  else
    update public.profiles
    set display_name = coalesce(nullif(trim(display_name), ''), username, '')
    where display_name is null or trim(display_name) = '';
  end if;
end
$migration$;

-- Refresh the PostgREST schema cache immediately so new columns are queryable.
select pg_notify('pgrst', 'reload schema');