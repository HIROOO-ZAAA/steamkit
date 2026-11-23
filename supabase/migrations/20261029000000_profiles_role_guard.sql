-- Prevent authenticated users from escalating their own role.
--
-- The live policy "Users manage own profile" is FOR ALL with no column
-- restriction, which lets any signed-in creator call PostgREST directly and
-- SET role = 'admin'. This migration adds two guards:
--
-- 1. A BEFORE UPDATE trigger that aborts any write that changes the role
--    column unless the current role is service_role. The trigger runs even
--    when the column is not listed in the SET clause (PostgreSQL fires BEFORE
--    triggers unconditionally), so it checks OLD.role <> NEW.role rather than
--    looking for the column in TG_ARGV.
--
-- 2. Column-level REVOKE so authenticated cannot write role at the privilege
--    layer either. Service_role is unaffected (it inherits nothing from
--    authenticated and holds its own grant).
--
-- Together these are defence in depth: an attacker who bypasses one hits the
-- other. Provisioning a real admin requires the service role (e.g. the
-- Supabase dashboard SQL editor or the admin API).

-- --------------------------------------------------------------------------
-- Trigger
-- --------------------------------------------------------------------------

create or replace function public.streamkit_guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Allow the change when the database session is running as service_role;
  -- reject it for every other role (authenticated, anon, or anything else).
  if old.role is distinct from new.role
     and current_setting('role', true) is distinct from 'service_role'
  then
    raise exception
      'permission denied: profiles.role may only be changed by a service-role caller'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$;

-- Drop the old trigger if it exists under any earlier name so this is
-- idempotent even if a partial migration was applied.
drop trigger if exists streamkit_guard_profile_role on public.profiles;

create trigger streamkit_guard_profile_role
  before update on public.profiles
  for each row
  execute function public.streamkit_guard_profile_role();

-- --------------------------------------------------------------------------
-- Column-level privilege: revoke UPDATE on role from authenticated
-- --------------------------------------------------------------------------

-- PostgreSQL column-level REVOKE narrows what the role may include in an
-- UPDATE SET list. An authenticated caller whose SET omits the role column is
-- unaffected; one who includes it gets a privilege error before the trigger
-- even fires.
--
-- Note: REVOKE ... ON TABLE ... applies to all columns; the column-specific
-- form is the one used here.
revoke update (role) on table public.profiles from authenticated;

-- The schema baseline and the "Users manage own profile" policy are correct
-- for their other fields (username, avatar_url, stream_title, etc.); no
-- policy change is needed. This migration adds enforcement at the column and
-- trigger layers only.

