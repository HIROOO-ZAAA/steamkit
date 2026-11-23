-- Review-only migration: block authenticated users from escalating privileges by changing profiles.role
--
-- Exploit path (verified):
-- - profiles has policy "Users manage own profile" FOR ALL USING (auth.uid() = id) with no role guard
-- - authenticated has table INSERT/UPDATE on public.profiles
-- - has_column_privilege('authenticated','public.profiles','role','UPDATE') = true
-- - Any signed-in creator can call PostgREST directly to set role='admin' and pass the admin gate
--
-- Fix:
-- - Revoke broad table INSERT/UPDATE from authenticated
-- - Grant column-level INSERT/UPDATE only on safe, user-editable profile fields (exclude role, created_at, id)
-- - role defaults to 'creator' on insert; role/created_at/id cannot be changed by authenticated users
-- - service_role retains full access (existing grants); SECURITY DEFINER functions run as owner
--
-- This migration is NOT applied. Apply only after review and explicit approval.
-- Run: npm run verify:migrations before pasting to SQL Editor

-- Ensure RLS remains enabled (idempotent)
alter table public.profiles enable row level security;

-- Remove broad table privileges so column-level grants can be enforced
revoke insert, update on table public.profiles from authenticated;

-- Allow authenticated users to create their own profile with safe fields only
-- (role will use DEFAULT 'creator'; created_at uses DEFAULT now())
grant insert (
  id,
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  stream_title
) on table public.profiles to authenticated;

-- Allow authenticated users to update safe profile fields only (cannot change role/created_at/id)
grant update (
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  stream_title
) on table public.profiles to authenticated;

-- PostgREST schema cache reload
select pg_notify('pgrst', 'reload schema');

-- Verification queries (read-only, do not modify data):
--   select has_table_privilege('authenticated','public.profiles','UPDATE') as auth_table_update;
--   select has_column_privilege('authenticated','public.profiles','role','UPDATE') as auth_update_role;
--   select has_column_privilege('authenticated','public.profiles','display_name','UPDATE') as auth_update_display_name;
--   select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='profiles' order by grantee, privilege_type;
--   select grantee, column_name, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' order by column_name, privilege_type;
--
-- Expected after apply:
--   auth_table_update should be false (or only service_role has it)
--   auth_update_role = false
--   auth_update_display_name = true
--   authenticated should have no table INSERT/UPDATE; column-level INSERT/UPDATE only on safe columns
--
-- Side effects:
-- - Any client code that tries to INSERT/UPDATE profiles with role, created_at, or id will fail with insufficient privilege
--   (current app code only upserts id, display_name, username, avatar_url, banner_url - compatible)
-- - If any new code inserts non-granted columns, it will fail; update column list if needed
-- - SECURITY DEFINER functions (owned by postgres) and service_role are unaffected
-- - RLS policies still apply (using/with check unchanged)
--
-- Rollback (if needed, after approval and testing):
--   grant insert, update on table public.profiles to authenticated;
--   revoke insert (id, display_name, username, avatar_url, banner_url, bio, stream_title) on table public.profiles from authenticated;
--   revoke update (display_name, username, avatar_url, banner_url, bio, stream_title) on table public.profiles from authenticated;
--   select pg_notify('pgrst', 'reload schema');
--   -- Re-verify privileges
