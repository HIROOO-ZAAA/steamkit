-- StreamKit canonical profiles role privilege guard (revision 3).
--
-- Supersedes, but intentionally does not delete:
--   20261029000000_profiles_role_guard.sql
--   20261030000000_profiles_role_privilege_guard.sql
--
-- Both older files stay in the tree because a live database may have come from
-- either one. Do not re-run either older file against a live database. Apply
-- this file last; a rebuild that runs migrations in filename order will apply
-- the older files before this one, which is expected.
-- This file is not applied by the review that produced it.
--
-- Threat:
--   authenticated had table INSERT/UPDATE on public.profiles, and the
--   "Users manage own profile" policy was FOR ALL with auth.uid() = id. A new
--   user with no profile row could INSERT role = 'admin'; an existing user
--   could UPDATE it. The same policy also authorized DELETE, even where the
--   table grant did not include it.
--
-- Product-flow finding (2026-10-30):
--   No application path deletes or truncates public.profiles.
--   src/app/dashboard/settings/page.tsx only upserts the authenticated user's
--   own row. Account deletion, if added later, should go through
--   auth.admin.deleteUser(); the FK public.profiles.id -> auth.users.id
--   ON DELETE CASCADE runs as the table owner, not as authenticated.
--   Therefore authenticated DELETE and TRUNCATE are not product requirements.
--
-- Model:
--   1. Drop every INSERT/UPDATE/DELETE/ALL policy on public.profiles, not only
--      the known legacy names. The intended write policy set is exactly the two
--      policies created below, so an unexpected permissive policy cannot survive
--      under another name. The public SELECT policy is left in place; its name
--      is deliberately not assumed.
--   2. Revoke every table privilege from PUBLIC, anon, and authenticated, then
--      explicitly revoke every column-level SELECT/INSERT/UPDATE/REFERENCES
--      privilege on every current column from those roles (and clean up
--      service_role's column ACLs). A live database may have legacy columns
--      such as full_name plus grants that no repository file creates. This
--      enumerates all of them before re-granting instead of relying on grant
--      history or on table-scope REVOKE semantics.
--   3. Re-grant only SELECT and column-scoped INSERT/UPDATE on the reviewed
--      safe columns. This removes DELETE, TRUNCATE, REFERENCES, and TRIGGER,
--      including grants inherited from ALTER DEFAULT PRIVILEGES.
--   4. Grant UPDATE (id) because PostgREST's merge-duplicates upsert includes
--      every body column, including the conflict target, in DO UPDATE SET
--      (PostgREST issue #2446 / QueryBuilder.hs). Supabase's .upsert() sends
--      id in the body, so without this grant the settings save returns 42501.
--      RLS WITH CHECK still requires the new id to equal auth.uid(), so id
--      cannot be moved to another user. This necessity must still be confirmed
--      against the deployed PostgREST version by the HTTP test plan.
--   5. Keep a BEFORE INSERT OR UPDATE trigger as defense in depth. It permits
--      role changes only for trusted administrator contexts. It trusts the
--      effective role plus session_user, never a JWT role claim.
--   6. service_role keeps server-side SELECT/INSERT/UPDATE for provisioning,
--      but no DELETE, TRUNCATE, REFERENCES, or TRIGGER. No current route deletes
--      profiles; account deletion should use auth.admin.deleteUser() and the FK
--      cascade.
--   7. Revoke EXECUTE on the trigger function after creating the trigger.
--      PostgreSQL checks EXECUTE at trigger creation time, not at fire time; the
--      trigger still runs. This blocks direct RPC exposure.
--   8. Post-check every current column, the policy shape, role memberships,
--      RLS, the trigger, and function grants before COMMIT. Any failure aborts
--      the whole transaction.
--
-- Apply in one transaction, in the Supabase Dashboard -> SQL Editor, only
-- after review and explicit approval. Do not run statement by statement.
-- If any statement fails, run ROLLBACK; and do not paste the remainder.
-- The DO blocks at the end re-check the security shape before COMMIT.

begin;

-- The migration assumes the standard Supabase roles. Fail with one clear error
-- rather than letting a later GRANT or has_* call fail on a missing role.
-- service_role must be able to bypass RLS because this file removes every
-- write policy below, including any policy addressed only to service_role.
do $migration$
begin
  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception
      'profiles hardening requires the Supabase roles anon, authenticated, and service_role';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
      and rolbypassrls
  ) then
    raise exception
      'profiles hardening requires service_role to have BYPASSRLS';
  end if;

  -- A superuser cannot be constrained by table grants: has_table_privilege()
  -- would report DELETE/TRUNCATE as held even after REVOKE. Fail closed instead
  -- of committing a migration whose service_role post-check is meaningless.
  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
      and rolsuper
  ) then
    raise exception
      'profiles hardening rejects a superuser service_role; use a BYPASSRLS non-superuser role';
  end if;

  -- RLS is the row boundary. A client role with BYPASSRLS or superuser would
  -- bypass it even though its table and column grants look safe.
  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated')
      and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'profiles hardening requires anon and authenticated to be non-superuser roles without BYPASSRLS';
  end if;
end
$migration$;

alter table public.profiles enable row level security;

-- Remove every write policy, regardless of its name, before creating the
-- intended pair. This includes legacy FOR ALL policies that also authorize
-- SELECT and DELETE. The separate public SELECT policy is intentionally not
-- touched; the post-check verifies its shape without assuming its name.
do $migration$
declare
  v_policies text[];
  v_policy text;
begin
  select array_agg(policyname::text)
  into v_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  if v_policies is not null then
    foreach v_policy in array v_policies loop
      execute format('drop policy %I on public.profiles', v_policy);
    end loop;
  end if;
end
$migration$;

drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;

create policy "Users insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Remove table-level privileges first. A table-level grant covers every
-- column, so it must be gone before column grants can narrow access. REVOKE
-- ALL also removes DELETE, TRUNCATE, REFERENCES, and TRIGGER that may have
-- arrived through Supabase default privileges.
revoke all privileges on table public.profiles
  from public, anon, authenticated;

-- Enumerate every current column even though table-scope REVOKE also removes
-- matching column privileges. The explicit pass makes cleanup complete for
-- legacy columns such as full_name and gives the post-check an all-column
-- invariant instead of relying on grant history. The safe INSERT/UPDATE
-- grants are added back immediately below; table SELECT is re-granted at table
-- scope.
do $migration$
declare
  v_columns text[];
  v_col text;
begin
  select array_agg(a.attname::text order by a.attnum)
  into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is not null then
    foreach v_col in array v_columns loop
      execute format(
        'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) ' ||
        'on table public.profiles from public, anon, authenticated, service_role',
        v_col
      );
    end loop;
  end if;
end
$migration$;

-- Public pages and the authenticated dashboard read only reviewed profile
-- fields. Sensitive and unreviewed columns remain unavailable to client roles.
grant select (
  id,
  username,
  display_name,
  avatar_url,
  banner_url,
  bio,
  stream_title
) on table public.profiles to anon, authenticated;

-- Safe columns only. role uses DEFAULT 'creator'; created_at uses now().
-- id is required for INSERT and for PostgREST upsert's DO UPDATE SET.
grant insert (
  id,
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  stream_title
) on table public.profiles to authenticated;

grant update (
  id,
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  stream_title
) on table public.profiles to authenticated;

-- Trusted server routes use the service key. They do not inherit from
-- authenticated, so keep their provisioning grants explicit. No current route
-- deletes profiles, and account deletion should use auth.admin.deleteUser()
-- with the FK cascade. DELETE and TRUNCATE therefore stay off this role too.
revoke all privileges on table public.profiles from service_role;
grant select, insert, update on table public.profiles to service_role;

-- Defense in depth: catches a future accidental table-level or column-level
-- grant on role. It does not depend on auth.uid() or JWT role claims.
create or replace function public.streamkit_guard_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_effective_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
  v_trusted boolean;
begin
  -- Trusted contexts:
  --   - PostgREST service_role: role setting is service_role.
  --   - SQL Editor or direct admin session: no SET ROLE, or an admin-to-admin
  --     role switch, with session_user postgres or supabase_admin.
  --   - Direct service_role connection: no SET ROLE, session_user is
  --     service_role.
  -- A normal authenticated PostgREST session has role = authenticated and
  -- session_user = authenticator, so it is deliberately not trusted. A
  -- session that does SET ROLE authenticated from a postgres SQL Editor is
  -- also not trusted, because its role setting is neither 'none' nor an admin
  -- role.
  v_trusted :=
    v_effective_role = 'service_role'
    or (
      v_effective_role = 'none'
      and session_user in ('postgres', 'supabase_admin', 'service_role')
    )
    or (
      v_effective_role in ('postgres', 'supabase_admin')
      and session_user in ('postgres', 'supabase_admin')
    );

  if tg_op = 'INSERT' then
    if new.role is distinct from 'creator' and not v_trusted then
      raise exception
        'permission denied: profiles.role may only be set by a trusted administrator'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.role is distinct from old.role and not v_trusted then
    raise exception
      'permission denied: profiles.role may only be changed by a trusted administrator'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$;

drop trigger if exists streamkit_guard_profile_role on public.profiles;
create trigger streamkit_guard_profile_role
  before insert or update on public.profiles
  for each row
  execute function public.streamkit_guard_profile_role();

-- Trigger functions cannot be called directly as RPC. PostgreSQL checks
-- EXECUTE when the trigger is created, not when it fires, so revoking the
-- default PUBLIC grant here does not disable the trigger.
revoke all on function public.streamkit_guard_profile_role()
  from public, anon, authenticated, service_role;

-- Re-check the security shape before COMMIT. Any failure aborts the whole
-- transaction, so a partial or unsafe state is never committed.
do $migration$
declare
  v_role text;
  v_priv text;
  v_grantable boolean;
  v_columns text[];
  v_col text;
  v_name text;
  v_safe text[] := array[
    'id',
    'display_name',
    'username',
    'avatar_url',
    'banner_url',
    'bio',
    'stream_title'
  ];
  v_policy_count integer;
  v_roles name[];
  v_permissive text;
  v_cmd text;
  v_qual text;
  v_check text;
begin
  -- PUBLIC, anon, and authenticated must have no direct table-level ACL.
  -- Client reads are granted only at the reviewed column level below.
  for v_role, v_priv in
    select
      case when a.grantee = 0 then 'PUBLIC' else r.rolname end,
      a.privilege_type
    from pg_catalog.pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    left join pg_catalog.pg_roles r on r.oid = a.grantee
    where c.oid = 'public.profiles'::regclass
      and (
        a.grantee = 0
        or a.grantee = (select oid from pg_catalog.pg_roles where rolname = 'anon')
        or a.grantee = (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  loop
    raise exception
      'post-check failed: % still has table-level privilege %',
      v_role, v_priv;
  end loop;

  -- Effective table checks also catch privileges inherited through membership.
  -- SELECT is forbidden at table scope; approved reads are column-level only.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_priv in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] loop
      if has_table_privilege(v_role::name, 'public.profiles', v_priv) then
        raise exception 'post-check failed: % has table %', v_role, v_priv;
      end if;
    end loop;
  end loop;

  -- PUBLIC must not retain any direct column ACL. This is a catalog check
  -- because has_column_privilege() has no PUBLIC pseudo-role argument.
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    cross join lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
      and x.grantee = 0
  ) then
    raise exception 'post-check failed: PUBLIC still has column-level privileges';
  end if;

  -- No client role may hold a grantable column ACL. The safe INSERT/UPDATE
  -- grants are intentionally not grantable.
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    cross join lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
      and x.is_grantable
      and x.grantee in (
        select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')
      )
  ) then
    raise exception 'post-check failed: a client role can grant a column privilege onward';
  end if;

  -- Every current column is checked, including legacy columns the repository
  -- does not know about. authenticated may write only the reviewed safe list;
  -- anon may not write any column.
  select array_agg(a.attname::text order by a.attnum)
  into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is null then
    raise exception 'post-check failed: public.profiles has no current columns';
  end if;

  foreach v_col in array v_columns loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['INSERT', 'UPDATE'] loop
        if has_column_privilege(v_role::name, 'public.profiles', v_col, v_priv) then
          if v_role = 'authenticated'
             and v_col = any(v_safe) then
            continue;
          end if;
          raise exception
            'post-check failed: % can % column %',
            v_role, v_priv, v_col;
        end if;
      end loop;

      if has_column_privilege(v_role::name, 'public.profiles', v_col, 'REFERENCES') then
        raise exception
          'post-check failed: % can REFERENCES column %',
          v_role, v_col;
      end if;

      -- Any effective client SELECT must be on the reviewed allowlist.
      -- This also rejects future columns unless they are explicitly reviewed.
      if has_column_privilege(v_role::name, 'public.profiles', v_col, 'SELECT')
         and not (v_col = any(v_safe)) then
        raise exception
          'post-check failed: % can SELECT unapproved column %',
          v_role, v_col;
      end if;
    end loop;
  end loop;

  -- Both client roles must be able to read every reviewed public field.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_name in array v_safe loop
      if not has_column_privilege(
        v_role::name, 'public.profiles', v_name, 'SELECT'
      ) then
        raise exception
          'post-check failed: % cannot SELECT approved column %',
          v_role, v_name;
      end if;
    end loop;
  end loop;

  -- Explicitly keep the private role and creation timestamp unreadable.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_name in array array['role', 'created_at'] loop
      if has_column_privilege(
        v_role::name, 'public.profiles', v_name, 'SELECT'
      ) then
        raise exception
          'post-check failed: % can SELECT private column %',
          v_role, v_name;
      end if;
    end loop;
  end loop;

  -- The reviewed safe columns must actually be writable, or the settings page
  -- breaks even though the dangerous grants are gone.
  foreach v_priv in array array['INSERT', 'UPDATE'] loop
    foreach v_name in array v_safe loop
      if not has_column_privilege('authenticated', 'public.profiles', v_name, v_priv) then
        raise exception
          'post-check failed: authenticated cannot % safe column %',
          v_priv, v_name;
      end if;
    end loop;
  end loop;

  -- service_role is server-side only. It keeps provisioning writes but no
  -- table-scope destructive or DDL-adjacent privileges.
  if not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    raise exception 'post-check failed: service_role lost SELECT/INSERT/UPDATE';
  end if;
  foreach v_priv in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
    if has_table_privilege('service_role', 'public.profiles', v_priv) then
      raise exception 'post-check failed: service_role has %', v_priv;
    end if;
  end loop;

  -- Trigger function EXECUTE must not be reachable by a client role or PUBLIC.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(
         v_role::name,
         'public.streamkit_guard_profile_role()',
         'EXECUTE'
       ) then
      raise exception 'post-check failed: % can EXECUTE the trigger function', v_role;
    end if;
  end loop;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.streamkit_guard_profile_role()'::regprocedure
      and a.grantee = 0
  ) then
    raise exception 'post-check failed: PUBLIC can EXECUTE the trigger function';
  end if;

  -- RLS must stay enabled, and the trigger must be the enabled BEFORE ROW
  -- INSERT OR UPDATE trigger backed by an invoker function with an empty
  -- search_path.
  if not exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = 'public.profiles'::regclass
      and c.relrowsecurity
  ) then
    raise exception 'post-check failed: RLS is not enabled on public.profiles';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'streamkit_guard_profile_role'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgqual is null
      and t.tgnargs = 0
      and not t.tgdeferrable
      and not t.tginitdeferred
      and t.tgconstraint = 0
      and (t.tgtype::int & 1) = 1
      and (t.tgtype::int & 2) = 2
      and (t.tgtype::int & 4) = 4
      and (t.tgtype::int & 16) = 16
      and (t.tgtype::int & 8) = 0
      and (t.tgtype::int & 32) = 0
      and (t.tgtype::int & 64) = 0
      and p.pronamespace = 'public'::regnamespace
      and p.proname = 'streamkit_guard_profile_role'
      and p.pronargs = 0
      and p.prorettype = 'trigger'::regtype
      and not p.prosecdef
      and p.proconfig is not null
      and exists (
        select 1 from unnest(p.proconfig) as cfg
        where cfg = 'search_path=""'
      )
  ) then
    raise exception 'post-check failed: profile role trigger metadata is wrong';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and not t.tgisinternal
      and t.tgname <> 'streamkit_guard_profile_role'
  ) then
    raise exception 'post-check failed: an unexpected trigger exists on public.profiles';
  end if;

  -- Policy shape. Exactly the two write policies below may exist. Public read
  -- coverage is checked by shape, not by name: a permissive SELECT USING (true)
  -- must cover anon and one must cover authenticated. A single PUBLIC policy
  -- covers both; separate anon/authenticated policies are also accepted.
  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  if v_policy_count <> 2 then
    raise exception
      'post-check failed: expected 2 write policies, found %',
      v_policy_count;
  end if;

  select roles, permissive, cmd, qual, with_check
  into v_roles, v_permissive, v_cmd, v_qual, v_check
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'Users insert own profile';

  if not found
     or v_cmd <> 'INSERT'
     or v_permissive <> 'PERMISSIVE'
     or v_roles <> array['authenticated']::name[]
     or v_qual is not null
     or v_check is null
     or regexp_replace(v_check, '[[:space:]()]', '', 'g') <> 'auth.uid=id' then
    raise exception 'post-check failed: INSERT policy is missing or malformed';
  end if;

  select roles, permissive, cmd, qual, with_check
  into v_roles, v_permissive, v_cmd, v_qual, v_check
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'Users update own profile';

  if not found
     or v_cmd <> 'UPDATE'
     or v_permissive <> 'PERMISSIVE'
     or v_roles <> array['authenticated']::name[]
     or v_qual is null
     or regexp_replace(v_qual, '[[:space:]()]', '', 'g') <> 'auth.uid=id'
     or v_check is null
     or regexp_replace(v_check, '[[:space:]()]', '', 'g') <> 'auth.uid=id' then
    raise exception 'post-check failed: UPDATE policy is missing or malformed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and ('public' = any(roles) or 'anon' = any(roles))
  ) then
    raise exception 'post-check failed: PUBLIC or anon still has a write policy';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('DELETE', 'ALL')
  ) then
    raise exception 'post-check failed: a DELETE/ALL policy still exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
  ) then
    raise exception
      'post-check failed: a restrictive SELECT policy can override public read';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and ('public' = any(roles) or 'anon' = any(roles))
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
  ) then
    raise exception
      'post-check failed: no permissive anon/PUBLIC SELECT policy with USING (true) exists';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and ('public' = any(roles) or 'authenticated' = any(roles))
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
  ) then
    raise exception
      'post-check failed: no permissive authenticated/PUBLIC SELECT policy with USING (true) exists';
  end if;

  -- RLS is the row boundary. A client role with BYPASSRLS or superuser would
  -- bypass it even though its table and column grants look safe.
  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated')
      and (rolsuper or rolbypassrls)
  ) then
    raise exception
      'post-check failed: a client role is a superuser or has BYPASSRLS';
  end if;

  -- Client roles must not be members of a privileged role, directly or through
  -- another role. This is the SET ROLE path the column grants cannot close.
  if exists (
    with recursive memberships(member, roleid) as (
      select m.member, m.roleid
      from pg_catalog.pg_auth_members m
      union
      select ms.member, m.roleid
      from memberships ms
      join pg_catalog.pg_auth_members m on m.member = ms.roleid
    )
    select 1
    from memberships ms
    join pg_catalog.pg_roles member_role on member_role.oid = ms.member
    join pg_catalog.pg_roles granted_role on granted_role.oid = ms.roleid
    where member_role.rolname in ('authenticated', 'anon')
      and granted_role.rolname in ('service_role', 'postgres', 'supabase_admin')
  ) then
    raise exception
      'post-check failed: authenticated or anon is a member of a privileged role';
  end if;
end
$migration$;

select pg_notify('pgrst', 'reload schema');

commit;

-- Verification after apply (read-only):
--   select has_table_privilege('anon','public.profiles','SELECT') as anon_table_select,
--          has_table_privilege('authenticated','public.profiles','SELECT') as auth_table_select;
--   select has_column_privilege('anon','public.profiles','username','SELECT') as anon_username_select,
--          has_column_privilege('authenticated','public.profiles','username','SELECT') as auth_username_select;
--   select has_column_privilege('anon','public.profiles','role','SELECT') as anon_role_select,
--          has_column_privilege('authenticated','public.profiles','role','SELECT') as auth_role_select;
--   select has_column_privilege('anon','public.profiles','created_at','SELECT') as anon_created_at_select,
--          has_column_privilege('authenticated','public.profiles','created_at','SELECT') as auth_created_at_select;
--   select has_table_privilege('authenticated','public.profiles','INSERT') as auth_insert;
--   select has_table_privilege('authenticated','public.profiles','UPDATE') as auth_update;
--   select has_table_privilege('authenticated','public.profiles','DELETE') as auth_delete;
--   select has_table_privilege('authenticated','public.profiles','TRUNCATE') as auth_truncate;
--   select has_column_privilege('authenticated','public.profiles','role','UPDATE') as auth_update_role;
--   select has_column_privilege('authenticated','public.profiles','id','UPDATE') as auth_update_id;
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'profiles'
--    order by grantee, privilege_type;
--     Note: role_table_grants omits PUBLIC. Use the catalog/aclexplode
--     queries in docs/security/profiles-role-privilege-revision-2026-10-30.md
--     for a complete ACL snapshot including grantee 0.
--   select grantee, column_name, privilege_type
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles'
--    order by grantee, column_name, privilege_type;
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'profiles'
--    order by policyname;
--   select tgname, tgenabled
--     from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- Rollback is intentionally not included here. Dropping the grants or trigger
-- reopens the vulnerability; use docs/security/profiles-role-privilege-revision-2026-10-30.md.
