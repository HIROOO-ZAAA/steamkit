-- ============================================================================
-- StreamKit Stage 1 read-only audit: public.profiles role/privilege state
-- ============================================================================
--
-- Purpose:
--   Compare the live catalog state of public.profiles with the assumptions and
--   postconditions of
--   supabase/migrations/20261030000001_profiles_role_privilege_canonical.sql.
--
-- Safety:
--   * This is a proposed audit pack. It has not been executed.
--   * It contains only SELECT statements plus READ ONLY transaction control.
--   * It ends in ROLLBACK. It does not change privileges, policies, triggers,
--     functions, roles, or data.
--   * Run it only against an approved staging project, after review.
--   * Do not run it against production.
--   * Do not add DDL, DML, SET ROLE, SET SESSION AUTHORIZATION, NOTIFY, or
--     PostgreSQL file-system functions to this file.
--
-- How to read it:
--   * Empty result sets and zero counts are often the safe result.
--   * A non-empty result is not automatically a vulnerability, but it needs
--     manual review against the notes in each section and the review report.
--   * Queries are grouped by the Stage 1 audit areas.
-- ============================================================================
BEGIN TRANSACTION READ ONLY;
-- ----------------------------------------------------------------------------
-- 0. Preconditions and session context
-- ----------------------------------------------------------------------------
-- 0.1 Required objects and roles. A missing table or client role is a
-- precondition failure: later queries are guarded to return NULL, empty, or
-- INVESTIGATE rather than aborting, but resolve the missing object before
-- trusting any dependent result. A missing trigger function is reported
-- explicitly in 5.5 and is handled without regprocedure casts that would abort.
select to_regclass('public.profiles') is not null as profiles_table_present,
  to_regrole('anon') is not null as anon_role_present,
  to_regrole('authenticated') is not null as authenticated_role_present,
  to_regrole('service_role') is not null as service_role_present,
  to_regprocedure('public.streamkit_guard_profile_role()') is not null as trigger_function_present;
-- 0.2 Session context.
-- Record which database/session produced the audit. This does not prove the
-- Supabase project reference or that the target is staging.
select current_database() as database_name,
  current_user as effective_user,
  session_user as login_user,
  current_setting('role', true) as role_setting,
  current_schema() as current_schema,
  current_setting('server_version') as server_version;
-- ----------------------------------------------------------------------------
-- 1. Table and column privileges
-- ----------------------------------------------------------------------------
-- 1.1 Complete table ACL, including PUBLIC (grantee 0) and default ACLs.
-- A NULL relacl means PostgreSQL is using the owner/default ACL, not that the
-- table has no ACL at all. The acldefault() expansion makes that visible.
select c.oid::regclass::text as relation_name,
  c.relowner::regrole::text as table_owner,
  (c.relacl is null) as using_default_table_acl,
  case
    when a.grantee = 0 then 'PUBLIC'
    else coalesce(grantee.rolname::text, 'oid:' || a.grantee::text)
  end as grantee,
  case
    when a.grantor = 0 then 'PUBLIC'
    else coalesce(grantor.rolname::text, 'oid:' || a.grantor::text)
  end as grantor,
  a.privilege_type,
  a.is_grantable
from pg_class c
  cross join lateral aclexplode(
    coalesce(c.relacl, acldefault('r', c.relowner))
  ) a
  left join pg_roles grantee on grantee.oid = a.grantee
  left join pg_roles grantor on grantor.oid = a.grantor
where c.oid = to_regclass('public.profiles')
order by 4,
  6;
-- 1.2 Every current column and every direct column ACL entry.
-- A row with "(no direct ACL)" means that column has no direct column grant.
-- It does not describe effective privileges inherited from table-level grants.
select a.attnum,
  a.attname,
  coalesce(cardinality(a.attacl), 0) = 0 as no_direct_column_acl,
  a.attacl::text as raw_column_acl,
  case
    when x.grantee is null then '(no direct ACL)'
    when x.grantee = 0 then 'PUBLIC'
    else coalesce(grantee.rolname::text, 'oid:' || x.grantee::text)
  end as grantee,
  case
    when x.grantor is null then null
    when x.grantor = 0 then 'PUBLIC'
    else coalesce(grantor.rolname::text, 'oid:' || x.grantor::text)
  end as grantor,
  x.privilege_type,
  x.is_grantable
from pg_attribute a
  left join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem [])) x on true
  left join pg_roles grantee on grantee.oid = x.grantee
  left join pg_roles grantor on grantor.oid = x.grantor
where a.attrelid = to_regclass('public.profiles')
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum,
  x.privilege_type nulls first;
-- 1.3 Effective table privileges, including privileges inherited through
-- role membership. This is broader than the raw ACL in 1.1.
select r.rolname as role_name,
  p.privilege_name,
  case
    when to_regclass('public.profiles') is not null then has_table_privilege(
      r.rolname,
      'public.profiles',
      p.privilege_name
    )
    else null
  end as effective
from (
    values ('anon'),
      ('authenticated'),
      ('service_role')
  ) v(role_name)
  join pg_roles r on r.rolname::text = v.role_name
  cross join (
    values ('SELECT'),
      ('INSERT'),
      ('UPDATE'),
      ('DELETE'),
      ('TRUNCATE'),
      ('REFERENCES'),
      ('TRIGGER')
  ) p(privilege_name)
order by r.rolname,
  p.privilege_name;
-- 1.4 Effective per-column privileges for anon and authenticated. This is the
-- matrix that answers both the SELECT question and the write-safe-list check.
-- A missing client role returns NULL privilege cells; a missing table yields no
-- rows. Neither aborts. 0.1 and 5.1 report the missing object, and NULL/empty
-- output is not a safety claim.
select a.attnum,
  a.attname,
  (
    a.attname::text = any (
      array [
    'id', 'display_name', 'username', 'avatar_url',
    'banner_url', 'bio', 'stream_title'
  ]::text []
    )
  ) as in_canonical_safe_write_list,
  case
    when rp.table_present and rp.anon_present then has_column_privilege(
      'anon',
      'public.profiles',
      a.attname,
      'SELECT'
    )
    else null
  end as anon_select,
  case
    when rp.table_present and rp.auth_present then has_column_privilege(
      'authenticated',
      'public.profiles',
      a.attname,
      'SELECT'
    )
    else null
  end as auth_select,
  case
    when rp.table_present and rp.anon_present then has_column_privilege(
      'anon',
      'public.profiles',
      a.attname,
      'INSERT'
    )
    else null
  end as anon_insert,
  case
    when rp.table_present and rp.auth_present then has_column_privilege(
      'authenticated',
      'public.profiles',
      a.attname,
      'INSERT'
    )
    else null
  end as auth_insert,
  case
    when rp.table_present and rp.anon_present then has_column_privilege(
      'anon',
      'public.profiles',
      a.attname,
      'UPDATE'
    )
    else null
  end as anon_update,
  case
    when rp.table_present and rp.auth_present then has_column_privilege(
      'authenticated',
      'public.profiles',
      a.attname,
      'UPDATE'
    )
    else null
  end as auth_update,
  case
    when rp.table_present and rp.anon_present then has_column_privilege(
      'anon',
      'public.profiles',
      a.attname,
      'REFERENCES'
    )
    else null
  end as anon_references,
  case
    when rp.table_present and rp.auth_present then has_column_privilege(
      'authenticated',
      'public.profiles',
      a.attname,
      'REFERENCES'
    )
    else null
  end as auth_references
from pg_attribute a
  cross join (
    select to_regclass('public.profiles') is not null as table_present,
      to_regrole('anon') is not null as anon_present,
      to_regrole('authenticated') is not null as auth_present
  ) rp
where a.attrelid = to_regclass('public.profiles')
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum;
-- 1.5 Direct SELECT grants for PUBLIC, anon, and authenticated, split by scope.
-- The migration intends table-level SELECT for anon/authenticated and no direct
-- column-level SELECT grants for these grantees.
with client_roles(role_oid, role_name) as (
  select 0::oid,
    'PUBLIC'::text
  union all
  select oid,
    rolname::text
  from pg_roles
  where rolname in ('anon', 'authenticated')
)
select 'table'::text as acl_scope,
  null::text as column_name,
  cr.role_name as grantee,
  a.privilege_type,
  a.is_grantable
from pg_class c
  cross join lateral aclexplode(
    coalesce(c.relacl, acldefault('r', c.relowner))
  ) a
  join client_roles cr on cr.role_oid = a.grantee
where c.oid = to_regclass('public.profiles')
  and a.privilege_type = 'SELECT'
union all
select 'column'::text as acl_scope,
  a.attname::text as column_name,
  cr.role_name as grantee,
  x.privilege_type,
  x.is_grantable
from pg_attribute a
  cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem [])) x
  join client_roles cr on cr.role_oid = x.grantee
where a.attrelid = to_regclass('public.profiles')
  and a.attnum > 0
  and not a.attisdropped
  and x.privilege_type = 'SELECT'
order by 1,
  3,
  2;
-- ----------------------------------------------------------------------------
-- 2. RLS policies
-- ----------------------------------------------------------------------------
-- 2.1 RLS enabled and forced state. The canonical migration enables RLS; it
-- does not claim to force it. relforcerowsecurity is therefore informational,
-- but an owner-role bypass path still needs review.
select c.oid::regclass::text as relation_name,
  n.nspname as schema_name,
  c.relname,
  c.relkind,
  c.relrowsecurity,
  c.relforcerowsecurity,
  c.relowner::regrole::text as table_owner
from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
where c.oid = to_regclass('public.profiles');
-- 2.2 Every policy, with command, roles, USING, and WITH CHECK expressions.
select schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
-- 2.3 Identify public-read SELECT policies and their exact shape. A safe
-- public-read policy is permissive, has USING (true), and covers both anon and
-- authenticated (one PUBLIC policy may cover both).
select policyname,
  permissive,
  cmd,
  roles,
  qual,
  with_check,
  ('public'::name = any(roles)) as covers_public,
  ('anon'::name = any(roles)) as covers_anon,
  ('authenticated'::name = any(roles)) as covers_authenticated,
  (
    regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
  ) as using_true,
  case
    when permissive = 'PERMISSIVE'
    and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
    and roles <@ array ['public', 'anon', 'authenticated']::name []
    and (
      'public'::name = any(roles)
      or 'anon'::name = any(roles)
      or 'authenticated'::name = any(roles)
    ) then 'public_read_shape_review_required'
    else 'REVIEW'
  end as policy_classification
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and cmd = 'SELECT'
order by policyname;
-- ----------------------------------------------------------------------------
-- 3. Trigger and function
-- ----------------------------------------------------------------------------
-- 3.1 Every trigger, including internal triggers. The canonical migration
-- expects exactly one non-internal trigger on public.profiles.
select t.tgname,
  t.tgenabled,
  t.tgisinternal,
  t.tgfoid::regprocedure::text as trigger_function,
  pg_get_triggerdef(t.oid) as trigger_definition,
  (t.tgtype::int & 1) = 1 as for_each_row,
  (t.tgtype::int & 2) = 2 as is_before,
  (t.tgtype::int & 4) = 4 as has_insert_event,
  (t.tgtype::int & 8) = 8 as has_delete_event,
  (t.tgtype::int & 16) = 16 as has_update_event,
  (t.tgtype::int & 32) = 32 as has_truncate_event,
  (t.tgtype::int & 64) = 64 as is_instead_of,
  t.tgqual,
  t.tgnargs,
  t.tgdeferrable,
  t.tginitdeferred,
  t.tgconstraint
from pg_trigger t
where t.tgrelid = to_regclass('public.profiles')
order by t.tgname;
-- 3.2 Full function definition and reviewed metadata. Compare the returned
-- full_function_definition with the canonical function body manually. The
-- catalog can prove metadata; it cannot prove runtime behavior.
select p.oid::regprocedure::text as function_signature,
  n.nspname as schema_name,
  p.proname,
  p.proowner::regrole::text as function_owner,
  case
    when p.prosecdef then 'DEFINER'
    else 'INVOKER'
  end as security_mode,
  case
    p.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
    else p.provolatile::text
  end as volatility,
  p.proconfig,
  array_to_string(p.proconfig, ', ') as search_path_config,
  p.prorettype::regtype::text as return_type,
  p.pronargs,
  p.proacl::text as raw_function_acl,
  pg_get_functiondef(p.oid) as full_function_definition
from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
where p.oid = to_regprocedure('public.streamkit_guard_profile_role()');
-- 3.3 Heuristic body markers. These are literal, case-sensitive strpos()
-- checks against the reviewed source text; they are not proof of behavior.
-- A false marker or a full-definition mismatch requires investigation.
select p.oid::regprocedure::text as function_signature,
  strpos(p.prosrc, 'current_setting(''role'', true)') > 0 as has_effective_role_setting,
  strpos(p.prosrc, 'session_user') > 0 as has_session_user,
  strpos(p.prosrc, 'service_role') > 0 as has_service_role,
  strpos(p.prosrc, 'postgres') > 0 as has_postgres,
  strpos(p.prosrc, 'supabase_admin') > 0 as has_supabase_admin,
  strpos(p.prosrc, 'new.role') > 0 as has_new_role_reference,
  strpos(
    p.prosrc,
    'new.role is distinct from ''creator'''
  ) > 0 as has_insert_role_guard,
  strpos(p.prosrc, 'new.role is distinct from old.role') > 0 as has_update_role_guard,
  strpos(p.prosrc, 'insufficient_privilege') > 0 as has_error_code
from pg_proc p
where p.oid = to_regprocedure('public.streamkit_guard_profile_role()');
-- 3.4 Raw function ACL entries, including PUBLIC (grantee 0).
select case
    when a.grantee = 0 then 'PUBLIC'
    else coalesce(grantee.rolname::text, 'oid:' || a.grantee::text)
  end as grantee,
  case
    when a.grantor = 0 then 'PUBLIC'
    else coalesce(grantor.rolname::text, 'oid:' || a.grantor::text)
  end as grantor,
  a.privilege_type,
  a.is_grantable
from pg_proc p
  cross join lateral aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) a
  left join pg_roles grantee on grantee.oid = a.grantee
  left join pg_roles grantor on grantor.oid = a.grantor
where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
order by grantee,
  a.privilege_type;
-- 3.5 Effective EXECUTE check for the trigger function. The pg_proc join
-- returns no rows when the function is absent; 5.5 reports that condition.
-- No name-based privilege lookup is attempted for a missing function.
select r.rolname as role_name,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as effective_execute
from (
    values ('anon'),
      ('authenticated'),
      ('service_role')
  ) v(role_name)
  join pg_roles r on r.rolname::text = v.role_name
  join pg_proc p on p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
order by r.rolname;
-- ----------------------------------------------------------------------------
-- 4. Role membership and effective privileges
-- ----------------------------------------------------------------------------
-- 4.1 Role attributes for the expected roles and every superuser/BYPASSRLS
-- role. This catches an arbitrary privileged role that is not named here.
select rolname,
  rolsuper,
  rolbypassrls,
  rolinherit,
  rolcanlogin,
  rolcreatedb,
  rolcreaterole,
  rolreplication,
  rolconnlimit
from pg_roles
where rolsuper
  or rolbypassrls
  or rolname in (
    'anon',
    'authenticated',
    'service_role',
    'postgres',
    'supabase_admin',
    'authenticator',
    'pg_database_owner',
    'pg_read_all_data',
    'pg_write_all_data'
  )
order by rolname;
-- 4.2 Recursive membership paths from anon and authenticated. This is a
-- membership inventory, not a claim that every path is automatically
-- inherited or that every path supports SET ROLE. It includes indirect
-- membership and records membership options when the server exposes them.
-- The option columns describe the final edge of each displayed path; 5.6
-- separately counts all membership edges from reachable roles.
-- to_jsonb() keeps the query compatible with servers where
-- inherit_option/set_option are not catalog columns. Cycle protection is
-- path-based; there is no arbitrary depth cap.
with recursive role_paths(
  member_oid,
  role_oid,
  depth,
  path,
  admin_option,
  inherit_option,
  set_option
) as (
  select r.oid,
    r.oid,
    0,
    array [r.rolname::text],
    null::text,
    null::text,
    null::text
  from pg_roles r
  where r.rolname in ('anon', 'authenticated')
  union all
  select p.member_oid,
    m.roleid,
    p.depth + 1,
    p.path || granted.rolname::text,
    to_jsonb(m)->>'admin_option',
    to_jsonb(m)->>'inherit_option',
    to_jsonb(m)->>'set_option'
  from role_paths p
    join pg_auth_members m on m.member = p.role_oid
    join pg_roles granted on granted.oid = m.roleid
  where not (granted.rolname::text = any (p.path))
)
select p.member_oid::regrole::text as member_role,
  p.role_oid::regrole::text as reachable_role,
  p.depth,
  array_to_string(p.path, ' -> ') as membership_path,
  p.admin_option,
  p.inherit_option,
  p.set_option,
  granted.rolsuper,
  granted.rolbypassrls,
  granted.rolinherit,
  granted.rolcreatedb,
  granted.rolcreaterole,
  granted.rolreplication,
  granted.rolcanlogin
from role_paths p
  join pg_roles granted on granted.oid = p.role_oid
where p.depth > 0
order by member_role,
  p.depth,
  reachable_role;
-- 4.3 Owner-role reachability for the table, schema, database, and trigger
-- function. A true value means a client role can reach the owner role through
-- membership, which is a privileged-path concern. A NULL reachability column
-- means the corresponding client role is absent; 0.1 and 5.1 report that.
with owner_objects(object_type, object_identity, owner_oid) as (
  select 'table'::text,
    c.oid::regclass::text,
    c.relowner
  from pg_class c
  where c.oid = to_regclass('public.profiles')
  union all
  select 'schema'::text,
    n.nspname::text,
    n.nspowner
  from pg_namespace n
  where n.nspname = 'public'
  union all
  select 'database'::text,
    d.datname::text,
    d.datdba
  from pg_database d
  where d.datname = current_database()
  union all
  select 'trigger function'::text,
    p.oid::regprocedure::text,
    p.proowner
  from pg_proc p
  where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
)
select o.object_type,
  o.object_identity,
  o.owner_oid::regrole::text as owner_role,
  case
    when to_regrole('anon') is not null then pg_has_role(
      'anon',
      o.owner_oid,
      'MEMBER'
    )
    else null
  end as anon_can_reach_owner,
  case
    when to_regrole('authenticated') is not null then pg_has_role(
      'authenticated',
      o.owner_oid,
      'MEMBER'
    )
    else null
  end as auth_can_reach_owner
from owner_objects o
order by o.object_type;
-- 4.4 SECURITY DEFINER functions outside system schemas that anon or
-- authenticated can execute. This is an inventory, not a finding by itself:
-- review each function's owner and body for privileged escalation. A missing
-- client role produces NULL for its privilege column and cannot match the
-- executable filter; 0.1 and 5.1 report the missing role.
select f.schema_name,
  f.proname,
  f.function_signature,
  f.function_owner,
  f.anon_can_execute,
  f.auth_can_execute
from (
  select n.nspname as schema_name,
    p.proname,
    p.oid::regprocedure::text as function_signature,
    p.proowner::regrole::text as function_owner,
    case
      when to_regrole('anon') is not null then has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
      else null
    end as anon_can_execute,
    case
      when to_regrole('authenticated') is not null then has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      else null
    end as auth_can_execute
  from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
) f
where f.anon_can_execute
  or f.auth_can_execute
order by f.schema_name,
  f.proname,
  f.function_signature;
-- ----------------------------------------------------------------------------
-- 5. Migration compatibility checks
-- ----------------------------------------------------------------------------
-- These checks turn the canonical migration's preconditions and postconditions
-- into PASS/INVESTIGATE rows. They are observations, not an apply decision.
-- 5.1 Role prerequisites.
with checks(check_name, observed, expected) as (
  select 'anon role exists',
    (to_regrole('anon') is not null)::text,
    'true'
  union all
  select 'authenticated role exists',
    (to_regrole('authenticated') is not null)::text,
    'true'
  union all
  select 'service_role role exists',
    (to_regrole('service_role') is not null)::text,
    'true'
  union all
  select 'service_role has BYPASSRLS',
    coalesce(
      (
        select rolbypassrls
        from pg_roles
        where rolname = 'service_role'
      ),
      false
    )::text,
    'true'
  union all
  select 'service_role is not a superuser',
    coalesce(
      (
        select not rolsuper
        from pg_roles
        where rolname = 'service_role'
      ),
      false
    )::text,
    'true'
  union all
  select 'anon is not a superuser and does not have BYPASSRLS',
    coalesce(
      (
        select not (
            rolsuper
            or rolbypassrls
          )
        from pg_roles
        where rolname = 'anon'
      ),
      false
    )::text,
    'true'
  union all
  select 'authenticated is not a superuser and does not have BYPASSRLS',
    coalesce(
      (
        select not (
            rolsuper
            or rolbypassrls
          )
        from pg_roles
        where rolname = 'authenticated'
      ),
      false
    )::text,
    'true'
)
select check_name,
  observed,
  expected,
  case
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks;
-- 5.2 Table ACL compatibility summary. Effective-privilege rows are guarded by
-- table and role presence; a missing object yields NULL and forces INVESTIGATE
-- instead of calling a privilege function for a nonexistent role. 0.1 and 5.1
-- identify the missing object.
with table_acl as (
  select a.grantee,
    a.privilege_type,
    a.is_grantable
  from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
  where c.oid = to_regclass('public.profiles')
),
client_roles(role_oid, role_name) as (
  select 0::oid,
    'PUBLIC'::text
  union all
  select oid,
    rolname::text
  from pg_roles
  where rolname in ('anon', 'authenticated')
),
checks(check_name, observed, expected) as (
  select 'PUBLIC table ACL entries',
    count(*)::text,
    '0'
  from table_acl
  where grantee = 0
  union all
  select 'anon table non-SELECT entries',
    count(*)::text,
    '0'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'anon'
    and t.privilege_type <> 'SELECT'
  union all
  select 'authenticated table non-SELECT entries',
    count(*)::text,
    '0'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'authenticated'
    and t.privilege_type <> 'SELECT'
  union all
  select 'anon has direct table SELECT',
    coalesce(bool_or(t.privilege_type = 'SELECT'), false)::text,
    'true'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'anon'
  union all
  select 'authenticated has direct table SELECT',
    coalesce(bool_or(t.privilege_type = 'SELECT'), false)::text,
    'true'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'authenticated'
  union all
  select 'anon table SELECT is not grantable',
    coalesce(bool_and(not t.is_grantable), false)::text,
    'true'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'anon'
    and t.privilege_type = 'SELECT'
  union all
  select 'authenticated table SELECT is not grantable',
    coalesce(bool_and(not t.is_grantable), false)::text,
    'true'
  from table_acl t
    join client_roles c on c.role_oid = t.grantee
  where c.role_name = 'authenticated'
    and t.privilege_type = 'SELECT'
  -- The canonical migration revokes all service_role table privileges and then
  -- grants SELECT/INSERT/UPDATE. Exact entry count and non-grantability are
  -- audit expectations; the migration's post-check does not verify them.
  union all
  select 'service_role has SELECT/INSERT/UPDATE',
    count(distinct t.privilege_type)::text,
    '3'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
    and t.privilege_type in ('SELECT', 'INSERT', 'UPDATE')
  union all
  select 'service_role table ACL entry count',
    count(*)::text,
    '3'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
  union all
  select 'service_role unexpected table ACL privileges',
    count(*)::text,
    '0'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
    and t.privilege_type not in ('SELECT', 'INSERT', 'UPDATE')
  union all
  select 'service_role grantable table ACL entries',
    count(*)::text,
    '0'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
    and t.is_grantable
  union all
  select 'service_role expected table ACL entries are non-grantable',
    coalesce(bool_and(not t.is_grantable), false)::text,
    'true'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
    and t.privilege_type in ('SELECT', 'INSERT', 'UPDATE')
  union all
  select 'service_role destructive table entries',
    count(*)::text,
    '0'
  from table_acl t
    join pg_roles r on r.oid = t.grantee
  where r.rolname = 'service_role'
    and t.privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  union all
  select 'anon has effective table SELECT',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('anon') is not null then has_table_privilege('anon', 'public.profiles', 'SELECT')::text
      else null
    end,
    'true'
  union all
  select 'authenticated has effective table SELECT',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('authenticated') is not null then has_table_privilege('authenticated', 'public.profiles', 'SELECT')::text
      else null
    end,
    'true'
  union all
  select 'anon has no effective table write or DDL-adjacent privileges',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('anon') is not null then (
        not (
          has_table_privilege('anon', 'public.profiles', 'INSERT')
          or has_table_privilege('anon', 'public.profiles', 'UPDATE')
          or has_table_privilege('anon', 'public.profiles', 'DELETE')
          or has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
          or has_table_privilege('anon', 'public.profiles', 'REFERENCES')
          or has_table_privilege('anon', 'public.profiles', 'TRIGGER')
        )
      )::text
      else null
    end,
    'true'
  union all
  select 'authenticated has no effective table write or DDL-adjacent privileges',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('authenticated') is not null then (
        not (
          has_table_privilege('authenticated', 'public.profiles', 'INSERT')
          or has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
          or has_table_privilege('authenticated', 'public.profiles', 'DELETE')
          or has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
          or has_table_privilege('authenticated', 'public.profiles', 'REFERENCES')
          or has_table_privilege('authenticated', 'public.profiles', 'TRIGGER')
        )
      )::text
      else null
    end,
    'true'
  union all
  select 'service_role has effective SELECT/INSERT/UPDATE',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('service_role') is not null then (
        has_table_privilege('service_role', 'public.profiles', 'SELECT')
        and has_table_privilege('service_role', 'public.profiles', 'INSERT')
        and has_table_privilege('service_role', 'public.profiles', 'UPDATE')
      )::text
      else null
    end,
    'true'
  union all
  select 'service_role has no effective destructive table privileges',
    case
      when to_regclass('public.profiles') is not null
        and to_regrole('service_role') is not null then (
        not (
          has_table_privilege('service_role', 'public.profiles', 'DELETE')
          or has_table_privilege('service_role', 'public.profiles', 'TRUNCATE')
          or has_table_privilege('service_role', 'public.profiles', 'REFERENCES')
          or has_table_privilege('service_role', 'public.profiles', 'TRIGGER')
        )
      )::text
      else null
    end,
    'true'
)
select check_name,
  observed,
  expected,
  case
    when to_regclass('public.profiles') is null
      or to_regrole('anon') is null
      or to_regrole('authenticated') is null
      or to_regrole('service_role') is null then 'INVESTIGATE'
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks;
-- 5.3 Column ACL and effective-write compatibility summary.
-- The current-column set is empty when the table or either client role is
-- missing, so has_column_privilege() is not called in that case. An explicit
-- prerequisite row and the result mapping below force INVESTIGATE; 0.1 and 5.1
-- identify the missing object. Missing expected safe columns are reported
-- individually before any has_column_privilege() call is made for them.
with safe_columns(column_name, column_order) as (
  values ('id', 1),
    ('display_name', 2),
    ('username', 3),
    ('avatar_url', 4),
    ('banner_url', 5),
    ('bio', 6),
    ('stream_title', 7)
),
table_columns as (
  select a.attname::text as column_name
  from pg_attribute a
  where a.attrelid = to_regclass('public.profiles')
    and a.attnum > 0
    and not a.attisdropped
),
current_columns as (
  select c.column_name
  from table_columns c
  where to_regrole('anon') is not null
    and to_regrole('authenticated') is not null
),
present_safe_columns as (
  select s.column_name,
    s.column_order
  from safe_columns s
    join current_columns c on c.column_name = s.column_name
),
missing_safe_columns as (
  select s.column_name,
    s.column_order
  from safe_columns s
    left join table_columns c on c.column_name = s.column_name
  where c.column_name is null
),
direct_column_acl as (
  select a.attname::text as column_name,
    x.grantee,
    x.privilege_type,
    x.is_grantable
  from pg_attribute a
    cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem [])) x
  where a.attrelid = to_regclass('public.profiles')
    and a.attnum > 0
    and not a.attisdropped
),
checks(check_name, observed, expected) as (
  select 'column ACL summary prerequisites (table and client roles)',
    (
      to_regclass('public.profiles') is not null
      and to_regrole('anon') is not null
      and to_regrole('authenticated') is not null
    )::text,
    'true'
  union all
  select 'current column count is non-zero',
    (count(*) > 0)::text,
    'true'
  from current_columns
  union all
  select 'missing expected safe columns',
    count(*)::text,
    '0'
  from missing_safe_columns
  union all
  select 'required safe column missing: ' || s.column_name,
    'missing',
    'present'
  from missing_safe_columns s
  union all
  select 'anon has effective SELECT on every current column',
    (
      count(*) filter (
        where not has_column_privilege(
            'anon',
            'public.profiles',
            c.column_name,
            'SELECT'
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'authenticated has effective SELECT on every current column',
    (
      count(*) filter (
        where not has_column_privilege(
            'authenticated',
            'public.profiles',
            c.column_name,
            'SELECT'
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'anon has no effective column INSERT/UPDATE',
    (
      count(*) filter (
        where has_column_privilege(
            'anon',
            'public.profiles',
            c.column_name,
            'INSERT'
          )
          or has_column_privilege(
            'anon',
            'public.profiles',
            c.column_name,
            'UPDATE'
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'anon has no effective column REFERENCES',
    (
      count(*) filter (
        where has_column_privilege(
            'anon',
            'public.profiles',
            c.column_name,
            'REFERENCES'
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'authenticated has no effective writes outside the safe list',
    (
      count(*) filter (
        where c.column_name not in (
            select column_name
            from safe_columns
          )
          and (
            has_column_privilege(
              'authenticated',
              'public.profiles',
              c.column_name,
              'INSERT'
            )
            or has_column_privilege(
              'authenticated',
              'public.profiles',
              c.column_name,
              'UPDATE'
            )
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'authenticated has effective INSERT and UPDATE on every present safe column',
    (
      count(*) filter (
        where not has_column_privilege(
            'authenticated',
            'public.profiles',
            s.column_name,
            p.privilege_name
          )
      ) = 0
    )::text,
    'true'
  from present_safe_columns s
    cross join (
      values ('INSERT'),
        ('UPDATE')
    ) p(privilege_name)
  union all
  select 'authenticated has no effective column REFERENCES',
    (
      count(*) filter (
        where has_column_privilege(
            'authenticated',
            'public.profiles',
            c.column_name,
            'REFERENCES'
          )
      ) = 0
    )::text,
    'true'
  from current_columns c
  union all
  select 'PUBLIC direct column ACL entries',
    count(*)::text,
    '0'
  from direct_column_acl
  where grantee = 0
  union all
  select 'direct client column SELECT ACL entries',
    count(*)::text,
    '0'
  from direct_column_acl
  where privilege_type = 'SELECT'
    and grantee in (
      0,
      coalesce(to_regrole('anon')::oid, 0),
      coalesce(to_regrole('authenticated')::oid, 0)
    )
  union all
  select 'grantable client column ACL entries',
    count(*)::text,
    '0'
  from direct_column_acl
  where is_grantable
    and grantee in (
      0,
      coalesce(to_regrole('anon')::oid, 0),
      coalesce(to_regrole('authenticated')::oid, 0)
    )
)
select check_name,
  observed,
  expected,
  case
    when to_regclass('public.profiles') is null
      or to_regrole('anon') is null
      or to_regrole('authenticated') is null then 'INVESTIGATE'
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks
order by check_name;
-- 5.4 Policy compatibility summary. Every SELECT policy is inventoried in
-- 2.3; these checks require public-read coverage and flag any additional
-- permissive SELECT policy for manual review rather than treating it as safe.
-- A PASS here is a catalog/text review indicator only, not proof of policy
-- semantics; 2.2/2.3 remain the mandatory expression review. Role arrays are
-- compared as sets (cardinality + containment), never by catalog array order.
with policies as (
  select policyname,
    permissive,
    cmd,
    roles,
    qual,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
),
public_read_role_sets as (
  select (
      select array_agg(
          role_name
          order by role_name
        )
      from unnest(roles) role_name
    ) as normalized_roles
  from policies
  where cmd = 'SELECT'
    and permissive = 'PERMISSIVE'
    and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
    and roles <@ array ['public', 'anon', 'authenticated']::name []
    and (
      'public'::name = any(roles)
      or 'anon'::name = any(roles)
      or 'authenticated'::name = any(roles)
    )
),
checks(check_name, observed, expected) as (
  select 'write policy count',
    count(*)::text,
    '2'
  from policies
  where cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  union all
  select 'DELETE/ALL policy count',
    count(*)::text,
    '0'
  from policies
  where cmd in ('DELETE', 'ALL')
  union all
  select 'restrictive SELECT policy count',
    count(*)::text,
    '0'
  from policies
  where cmd = 'SELECT'
    and permissive = 'RESTRICTIVE'
  union all
  select 'PUBLIC or anon write policy count',
    count(*)::text,
    '0'
  from policies
  where cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (
      'public'::name = any(roles)
      or 'anon'::name = any(roles)
    )
  union all
  select 'expected INSERT policy present',
    coalesce(
      bool_or(
        policyname = 'Users insert own profile'
        and cmd = 'INSERT'
        and permissive = 'PERMISSIVE'
        and cardinality(roles) = 1
        and roles @> array ['authenticated']::name []
        and roles <@ array ['authenticated']::name []
        and qual is null
        and regexp_replace(
          coalesce(with_check, ''),
          '[[:space:]()]',
          '',
          'g'
        ) = 'auth.uid=id'
      ),
      false
    )::text,
    'true'
  from policies
  union all
  select 'expected UPDATE policy present',
    coalesce(
      bool_or(
        policyname = 'Users update own profile'
        and cmd = 'UPDATE'
        and permissive = 'PERMISSIVE'
        and cardinality(roles) = 1
        and roles @> array ['authenticated']::name []
        and roles <@ array ['authenticated']::name []
        and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'auth.uid=id'
        and regexp_replace(
          coalesce(with_check, ''),
          '[[:space:]()]',
          '',
          'g'
        ) = 'auth.uid=id'
      ),
      false
    )::text,
    'true'
  from policies
  union all
  select 'permissive public SELECT policy for anon',
    coalesce(
      bool_or(
        cmd = 'SELECT'
        and permissive = 'PERMISSIVE'
        and (
          'public'::name = any(roles)
          or 'anon'::name = any(roles)
        )
        and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
      ),
      false
    )::text,
    'true'
  from policies
  union all
  select 'permissive public SELECT policy for authenticated',
    coalesce(
      bool_or(
        cmd = 'SELECT'
        and permissive = 'PERMISSIVE'
        and (
          'public'::name = any(roles)
          or 'authenticated'::name = any(roles)
        )
        and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
      ),
      false
    )::text,
    'true'
  from policies
  union all
  select 'permissive SELECT policies outside expected public-read shape',
    count(*)::text,
    '0'
  from policies
  where cmd = 'SELECT'
    and permissive = 'PERMISSIVE'
    and not (
      regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
      and roles <@ array ['public', 'anon', 'authenticated']::name []
      and (
        'public'::name = any(roles)
        or 'anon'::name = any(roles)
        or 'authenticated'::name = any(roles)
      )
    )
  union all
  select 'permissive SELECT policy count is at most two',
    (count(*) <= 2)::text,
    'true'
  from policies
  where cmd = 'SELECT'
    and permissive = 'PERMISSIVE'
  union all
  select 'duplicate public-read policy role sets',
    count(*)::text,
    '0'
  from (
      select normalized_roles
      from public_read_role_sets
      group by normalized_roles
      having count(*) > 1
    ) duplicate_role_sets
  union all
  select 'permissive public-read policies with non-canonical role sets',
    count(*)::text,
    '0'
  from policies
  where cmd = 'SELECT'
    and permissive = 'PERMISSIVE'
    and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
    and not (
      (
        cardinality(roles) = 1
        and roles @> array ['public']::name []
        and roles <@ array ['public']::name []
      )
      or (
        cardinality(roles) = 2
        and roles @> array ['anon', 'authenticated']::name []
        and roles <@ array ['anon', 'authenticated']::name []
      )
      or (
        cardinality(roles) = 1
        and roles @> array ['anon']::name []
        and roles <@ array ['anon']::name []
      )
      or (
        cardinality(roles) = 1
        and roles @> array ['authenticated']::name []
        and roles <@ array ['authenticated']::name []
      )
    )
  -- Heuristic only: this net count is not proof of coverage or policy safety.
  -- The independent anon/authenticated coverage checks above and the manual
  -- 2.2/2.3 expression review are authoritative; zero does not make a policy
  -- safe.
  union all
  select 'additional permissive public-read policies beyond required coverage (heuristic)',
    greatest(
      0,
      count(*) filter (
        where cmd = 'SELECT'
          and permissive = 'PERMISSIVE'
          and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
          and roles <@ array ['public', 'anon', 'authenticated']::name []
          and (
            'public'::name = any(roles)
            or 'anon'::name = any(roles)
            or 'authenticated'::name = any(roles)
          )
      ) - case
        when coalesce(
          bool_or(
            cmd = 'SELECT'
            and permissive = 'PERMISSIVE'
            and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
            and (
              'public'::name = any(roles)
              or (
                'anon'::name = any(roles)
                and 'authenticated'::name = any(roles)
              )
            )
          ),
          false
        ) then 1
        else 2
      end
    )::text,
    '0'
  from policies
)
select check_name,
  observed,
  expected,
  case
    when to_regclass('public.profiles') is null
      or to_regrole('anon') is null
      or to_regrole('authenticated') is null then 'INVESTIGATE'
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks;
-- 5.5 Trigger and function compatibility summary. The full definition must
-- still be compared manually; these checks only cover catalog metadata.
-- Function-dependent checks use to_regprocedure() or a pg_proc join so a
-- missing function produces INVESTIGATE rows instead of an abort.
with trigger_parts as (
  select t.oid,
    t.tgname,
    t.tgenabled,
    t.tgisinternal,
    t.tgtype,
    t.tgqual,
    t.tgnargs,
    t.tgdeferrable,
    t.tginitdeferred,
    t.tgconstraint,
    p.pronamespace,
    p.proname,
    p.pronargs,
    p.prorettype,
    p.prosecdef,
    p.proconfig
  from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = to_regclass('public.profiles')
),
checks(check_name, observed, expected) as (
  select 'non-internal trigger count',
    count(*)::text,
    '1'
  from trigger_parts
  where not tgisinternal
  union all
  select 'unexpected non-internal trigger count',
    count(*)::text,
    '0'
  from trigger_parts
  where not tgisinternal
    and tgname <> 'streamkit_guard_profile_role'
  union all
  select 'expected trigger metadata present',
    coalesce(
      bool_or(
        tgname = 'streamkit_guard_profile_role'
        and not tgisinternal
        and tgenabled = 'O'
        and tgqual is null
        and tgnargs = 0
        and not tgdeferrable
        and not tginitdeferred
        and tgconstraint = 0
        and (tgtype::int & 1) = 1
        and (tgtype::int & 2) = 2
        and (tgtype::int & 4) = 4
        and (tgtype::int & 16) = 16
        and (tgtype::int & 8) = 0
        and (tgtype::int & 32) = 0
        and (tgtype::int & 64) = 0
        and pronamespace = (
          select n.oid
          from pg_namespace n
          where n.nspname = 'public'
        )
        and proname = 'streamkit_guard_profile_role'
        and pronargs = 0
        and prorettype = 'trigger'::regtype
        and not prosecdef
        and proconfig is not null
        and exists (
          select 1
          from unnest(proconfig) cfg
          where cfg in ('search_path=', 'search_path=""')
        )
      ),
      false
    )::text,
    'true'
  from trigger_parts
  union all
  select 'trigger function exists',
    (
      to_regprocedure('public.streamkit_guard_profile_role()') is not null
    )::text,
    'true'
  union all
  select 'trigger function is SECURITY INVOKER',
    coalesce(
      (
        select not p.prosecdef
        from pg_proc p
        where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
      ),
      false
    )::text,
    'true'
  union all
  select 'trigger function is VOLATILE',
    coalesce(
      (
        select p.provolatile = 'v'
        from pg_proc p
        where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
      ),
      false
    )::text,
    'true'
  union all
  select 'trigger function has empty search_path',
    coalesce(
      (
        select exists (
            select 1
            from pg_proc p
              cross join lateral unnest(coalesce(p.proconfig, '{}'::text [])) cfg
            where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
              and cfg in ('search_path=', 'search_path=""')
          )
      ),
      false
    )::text,
    'true'
  union all
  select 'client roles with EXECUTE on trigger function',
    count(*)::text,
    '0'
  from (
      values ('anon'),
        ('authenticated'),
        ('service_role')
    ) v(role_name)
    join pg_roles r on r.rolname::text = v.role_name
    join pg_proc p on p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
  where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  union all
  select 'PUBLIC EXECUTE ACL entries',
    count(*)::text,
    '0'
  from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
  where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
    and a.grantee = 0
    and a.privilege_type = 'EXECUTE'
)
select check_name,
  observed,
  expected,
  case
    when to_regclass('public.profiles') is null
      or to_regprocedure('public.streamkit_guard_profile_role()') is null
      or to_regrole('anon') is null
      or to_regrole('authenticated') is null
      or to_regrole('service_role') is null then 'INVESTIGATE'
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks;
-- 5.6 Expanded role and owner compatibility summary.
-- Role-attribute and membership-option checks are conservative inventory
-- checks: they do not prove that inheritance or SET ROLE would succeed in a
-- real session. A missing table or client role forces INVESTIGATE rather than
-- aborting; 0.1 and 5.1 identify the missing object.
with recursive reachable(roleid) as (
  select oid
  from pg_roles
  where rolname in ('anon', 'authenticated')
  union
  select m.roleid
  from pg_auth_members m
    join reachable r on r.roleid = m.member
),
owner_objects(owner_oid) as (
  select c.relowner
  from pg_class c
  where c.oid = to_regclass('public.profiles')
  union all
  select n.nspowner
  from pg_namespace n
  where n.nspname = 'public'
  union all
  select d.datdba
  from pg_database d
  where d.datname = current_database()
  union all
  select p.proowner
  from pg_proc p
  where p.oid = to_regprocedure('public.streamkit_guard_profile_role()')
),
checks(check_name, observed, expected) as (
  select 'reachable superuser/BYPASSRLS roles outside anon/authenticated',
    count(distinct r.oid)::text,
    '0'
  from reachable x
    join pg_roles r on r.oid = x.roleid
  where (
      r.rolsuper
      or r.rolbypassrls
    )
    and r.rolname not in ('anon', 'authenticated')
  union all
  select 'named privileged role memberships for anon/authenticated',
    count(distinct r.oid)::text,
    '0'
  from reachable x
    join pg_roles r on r.oid = x.roleid
  where r.rolname in ('service_role', 'postgres', 'supabase_admin')
  union all
  -- This is a conservative inventory: a reachable role attribute is reported
  -- even when inheritance or SET ROLE behavior would not expose it in a given
  -- session. It is not proof of successful SET ROLE or credential use.
  select 'reachable roles with CREATEROLE',
    count(distinct r.oid)::text,
    '0'
  from reachable x
    join pg_roles r on r.oid = x.roleid
  where r.rolcreaterole
  union all
  select 'reachable roles with CREATEDB or REPLICATION',
    count(distinct r.oid)::text,
    '0'
  from reachable x
    join pg_roles r on r.oid = x.roleid
  where r.rolcreatedb
    or r.rolreplication
  union all
  select 'reachable membership edges with ADMIN OPTION',
    count(*)::text,
    '0'
  from reachable x
    join pg_auth_members m on m.member = x.roleid
  where coalesce(to_jsonb(m)->>'admin_option', 'false') = 'true'
  union all
  select 'reachable membership edges with SET OPTION',
    count(*)::text,
    '0'
  from reachable x
    join pg_auth_members m on m.member = x.roleid
  where coalesce(to_jsonb(m)->>'set_option', 'false') = 'true'
  union all
  select 'owner roles reachable from anon/authenticated',
    count(distinct r.oid)::text,
    '0'
  from owner_objects o
    join pg_roles r on r.oid = o.owner_oid
  where case
      when to_regrole('anon') is not null
        and to_regrole('authenticated') is not null then (
        pg_has_role('anon', o.owner_oid, 'MEMBER')
        or pg_has_role('authenticated', o.owner_oid, 'MEMBER')
      )
      else null
    end
  union all
  select 'RLS enabled on public.profiles',
    coalesce(
      (
        select c.relrowsecurity
        from pg_class c
        where c.oid = to_regclass('public.profiles')
      ),
      false
    )::text,
    'true'
)
select check_name,
  observed,
  expected,
  case
    when to_regclass('public.profiles') is null
      or to_regrole('anon') is null
      or to_regrole('authenticated') is null then 'INVESTIGATE'
    when observed is not distinct
    from expected then 'PASS'
      else 'INVESTIGATE'
  end as result
from checks;
-- End the read-only transaction. Do not replace this with COMMIT.
ROLLBACK;
-- END OF AUDIT