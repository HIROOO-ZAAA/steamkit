-- Scratch-only database tests for the canonical profiles role guard.
--
-- NEVER run this file against the linked Supabase project or production.
-- It creates auth users and profile rows, then rolls the whole transaction
-- back. The guard below requires an explicit scratch opt-in GUC.
--
-- This file assumes a local Supabase database (Docker) where the roles
-- anon, authenticated, and service_role already exist and service_role has
-- BYPASSRLS, matching Supabase. It does not create those roles.
--
-- Local Supabase example (Docker required):
--   $env:PGOPTIONS = "-c streamkit.profile_role_test=allowed"
--   psql "$env:LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profiles_role_privilege.scratch.sql
--
-- Expected SQLSTATEs:
--   INSERT role = 'admin' by a new authenticated user -> 42501
--   UPDATE role = 'admin' by an authenticated user    -> 42501
--   Normal settings upsert                            -> success
--   UPDATE another user's profile                     -> success with 0 rows
--   UPDATE own id to another user's id                -> 42501 (RLS WITH CHECK)
--   INSERT another user's id                          -> 42501 (RLS WITH CHECK)
--   DELETE or TRUNCATE as authenticated               -> 42501
--   service_role INSERT/UPDATE                        -> success, role writable
--   service_role DELETE                               -> 42501 (no delete grant)
--   SQL Editor postgres role promotion                -> success (role = none)
--
-- The cross-user test asserts row_count = 0 because RLS normally hides rows
-- instead of raising. A test that only checks "no exception" is not enough.
--
-- This file proves SQL-level behavior only. It does NOT prove PostgREST's
-- upsert SQL, HTTP status mapping, or JWT handling. See
-- profiles_role_privilege.postgrest.ps1 for the separate HTTP test plan.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('streamkit.profile_role_test', true) is distinct from 'allowed' then
    raise exception
      'Refusing to run: set streamkit.profile_role_test=allowed in a scratch database only';
  end if;
end
$$;

begin;

-- Fixed scratch identities. A has an existing profile; B, C, and D do not.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'scratch-alice@example.test',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    null,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'scratch-bob@example.test',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    null,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'authenticated',
    'authenticated',
    'scratch-carol@example.test',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    null,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'authenticated',
    'authenticated',
    'scratch-dave@example.test',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

delete from public.profiles
where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);

insert into public.profiles (id, display_name, username, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Scratch Alice',
  'scratch-alice',
  'creator'
);

-- Test 1: a new authenticated user can create a normal profile row.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.profiles (id, display_name, username)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Scratch Bob',
  'scratch-bob'
);

do $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  if v_role is distinct from 'creator' then
    raise exception 'FAIL test 1: normal INSERT did not use the creator default';
  end if;

  raise notice 'PASS test 1: normal profile INSERT succeeded with role creator';
end
$$;

reset role;

-- Test 2: a new authenticated user cannot insert role = 'admin'. This is
-- blocked by the column ACL before the trigger is reached.
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if auth.uid() is distinct from 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid then
    raise exception 'FAIL test 2: authenticated context was not established';
  end if;

  begin
    insert into public.profiles (id, display_name, role)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Scratch Dave', 'admin');

    raise exception 'FAIL test 2: admin INSERT succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 2: admin INSERT denied by column ACL with SQLSTATE 42501';
  end;
end
$$;

reset role;

-- Test 3: trigger bypass by temporarily granting INSERT (role). The ACL now
-- allows the column, so only the trigger can stop the promotion. The grant is
-- transaction-local and is revoked below.
grant insert (role) on table public.profiles to authenticated;

set local role authenticated;

do $$
begin
  begin
    insert into public.profiles (id, display_name, role)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Scratch Dave', 'admin');

    raise exception 'FAIL test 3: admin INSERT bypassed the trigger';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%profiles.role%' then
        raise exception 'FAIL test 3: wrong 42501 source: %', sqlerrm;
      end if;
      raise notice 'PASS test 3: trigger blocked admin INSERT after column grant';
  end;
end
$$;

reset role;

revoke insert (role) on table public.profiles from authenticated;

do $$
begin
  if exists (
    select 1 from public.profiles
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) then
    raise exception 'FAIL test 3: Dave profile was inserted despite trigger';
  end if;
end
$$;

-- Test 4: an existing authenticated user cannot update their role. This is
-- blocked by the column ACL before the trigger is reached.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    update public.profiles
    set role = 'admin'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    if not found then
      raise exception 'FAIL test 4: role UPDATE affected 0 rows';
    end if;

    raise exception 'FAIL test 4: admin UPDATE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 4: admin UPDATE denied by column ACL with SQLSTATE 42501';
  end;
end
$$;

reset role;

-- Test 5: trigger bypass by temporarily granting UPDATE (role). The trigger
-- must still block the promotion, and the role must remain creator.
grant update (role) on table public.profiles to authenticated;

set local role authenticated;

do $$
begin
  begin
    update public.profiles
    set role = 'admin'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    if not found then
      raise exception 'FAIL test 5: role UPDATE affected 0 rows';
    end if;

    raise exception 'FAIL test 5: admin UPDATE bypassed the trigger';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%profiles.role%' then
        raise exception 'FAIL test 5: wrong 42501 source: %', sqlerrm;
      end if;
      raise notice 'PASS test 5: trigger blocked admin UPDATE after column grant';
  end;
end
$$;

reset role;

revoke update (role) on table public.profiles from authenticated;

do $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_role is distinct from 'creator' then
    raise exception 'FAIL test 5: Alice role changed to %', v_role;
  end if;
end
$$;

-- Test 6: the current settings upsert must still work. PostgREST includes the
-- conflict target in DO UPDATE SET, so id = excluded.id is part of the test on
-- purpose. This is a SQL-level simulation, not proof of PostgREST behavior.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_created_before timestamptz;
  v_created_after timestamptz;
  v_display_name text;
  v_role text;
begin
  select created_at
  into v_created_before
  from public.profiles
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  insert into public.profiles (
    id,
    display_name,
    username,
    avatar_url,
    banner_url
  )
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Scratch Alice Updated',
    'scratch-alice',
    null,
    null
  )
  on conflict (id) do update
  set
    id = excluded.id,
    display_name = excluded.display_name,
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    banner_url = excluded.banner_url;

  select created_at, display_name, role
  into v_created_after, v_display_name, v_role
  from public.profiles
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_display_name is distinct from 'Scratch Alice Updated' then
    raise exception 'FAIL test 6: settings upsert did not update display_name';
  end if;
  if v_role is distinct from 'creator' then
    raise exception 'FAIL test 6: settings upsert changed role to %', v_role;
  end if;
  if v_created_after is distinct from v_created_before then
    raise exception 'FAIL test 6: settings upsert changed created_at';
  end if;

  raise notice 'PASS test 6: normal settings upsert succeeded; role and created_at stayed put';
end
$$;

reset role;

-- Test 7: Alice cannot update Bob's display name. RLS filters the row, so the
-- expected result is UPDATE 0, not an exception; assert the row is unchanged.
set local role authenticated;

do $$
declare
  v_count integer;
  v_display_name text;
begin
  update public.profiles
  set display_name = 'Hacked by Alice'
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  get diagnostics v_count = row_count;

  if v_count <> 0 then
    raise exception 'FAIL test 7: cross-user UPDATE affected % row(s)', v_count;
  end if;

  select display_name
  into v_display_name
  from public.profiles
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  if v_display_name is distinct from 'Scratch Bob' then
    raise exception 'FAIL test 7: cross-user UPDATE changed Bob to %', v_display_name;
  end if;

  raise notice 'PASS test 7: cross-user UPDATE affected 0 rows and Bob was unchanged';
end
$$;

reset role;

-- Test 8: Alice cannot move her own row to another user's id. UPDATE (id) is
-- granted for PostgREST upsert compatibility; RLS WITH CHECK must reject it.
set local role authenticated;

do $$
begin
  begin
    update public.profiles
    set id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    raise exception 'FAIL test 8: moving id to another user succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 8: id move denied by RLS WITH CHECK with SQLSTATE 42501';
  end;
end
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'FAIL test 8: Alice row disappeared';
  end if;
  if exists (
    select 1 from public.profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) then
    raise exception 'FAIL test 8: Carol row appeared';
  end if;
end
$$;

-- Test 9: Bob cannot INSERT a profile for Carol. The RLS INSERT policy's WITH
-- CHECK rejects the new row before the primary key is relevant.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    insert into public.profiles (id, display_name)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Carol by Bob');

    raise exception 'FAIL test 9: cross-user INSERT succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 9: cross-user INSERT denied by RLS with SQLSTATE 42501';
  end;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1 from public.profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) then
    raise exception 'FAIL test 9: Carol profile was inserted';
  end if;
end
$$;

-- Test 10: created_at is not writable by authenticated users, on INSERT or
-- UPDATE. These fail at the column ACL before RLS or the trigger.
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    insert into public.profiles (id, display_name, created_at)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Scratch Dave', now());

    raise exception 'FAIL test 10a: created_at INSERT succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 10a: created_at INSERT denied by column ACL';
  end;

  begin
    update public.profiles
    set created_at = now()
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    raise exception 'FAIL test 10b: created_at UPDATE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 10b: created_at UPDATE denied by column ACL';
  end;
end
$$;

reset role;

-- Test 11: authenticated users cannot DELETE their own profile. The old FOR
-- ALL policy authorized it; the ACL now denies it, and no DELETE policy exists.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    delete from public.profiles
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    raise exception 'FAIL test 11: self DELETE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 11: self DELETE denied with SQLSTATE 42501';
  end;
end
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'FAIL test 11: Alice row was deleted';
  end if;
end
$$;

-- Test 12: authenticated users cannot TRUNCATE the table.
set local role authenticated;

do $$
begin
  begin
    execute 'truncate public.profiles';

    raise exception 'FAIL test 12: TRUNCATE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 12: TRUNCATE denied with SQLSTATE 42501';
  end;
end
$$;

reset role;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.profiles;
  if v_count = 0 then
    raise exception 'FAIL test 12: profiles table was truncated';
  end if;
end
$$;

-- Test 13: anon can read public profiles but cannot write, delete, or truncate.
set local role anon;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.profiles;
  if v_count < 1 then
    raise exception 'FAIL test 13: anon could not read public profiles';
  end if;

  begin
    insert into public.profiles (id, display_name)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Carol by anon');
    raise exception 'FAIL test 13a: anon INSERT succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 13a: anon INSERT denied';
  end;

  begin
    update public.profiles
    set display_name = 'Hacked by anon'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL test 13b: anon UPDATE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 13b: anon UPDATE denied';
  end;

  begin
    delete from public.profiles
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL test 13c: anon DELETE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 13c: anon DELETE denied';
  end;

  begin
    execute 'truncate public.profiles';
    raise exception 'FAIL test 13d: anon TRUNCATE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 13d: anon TRUNCATE denied';
  end;
end
$$;

reset role;

-- Test 14: service_role can INSERT and UPDATE, and may set role. It cannot
-- DELETE; account deletion belongs to auth.admin.deleteUser() and the cascade.
set local role service_role;

insert into public.profiles (id, display_name, username, role)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Carol Provisioned',
  'scratch-carol',
  'admin'
);

do $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  if v_role is distinct from 'admin' then
    raise exception 'FAIL test 14a: service_role INSERT did not persist admin';
  end if;

  raise notice 'PASS test 14a: service_role INSERT with role admin succeeded';
end
$$;

update public.profiles
set role = 'creator', display_name = 'Carol Updated'
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
declare
  v_role text;
  v_display_name text;
begin
  select role, display_name
  into v_role, v_display_name
  from public.profiles
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  if v_role is distinct from 'creator' then
    raise exception 'FAIL test 14b: service_role UPDATE did not persist creator';
  end if;
  if v_display_name is distinct from 'Carol Updated' then
    raise exception 'FAIL test 14b: service_role UPDATE did not persist display_name';
  end if;

  raise notice 'PASS test 14b: service_role UPDATE succeeded';
end
$$;

do $$
begin
  begin
    delete from public.profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    raise exception 'FAIL test 14c: service_role DELETE succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS test 14c: service_role DELETE denied; account deletion uses auth cascade';
  end;
end
$$;

reset role;

-- Test 15: the SQL Editor's postgres session (role = none) is trusted, so a
-- dashboard administrator is not locked out of provisioning.
update public.profiles
set role = 'admin'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if v_role is distinct from 'admin' then
    raise exception 'FAIL test 15: SQL Editor administrator update did not persist';
  end if;

  raise notice 'PASS test 15: SQL Editor postgres provisioning succeeded';
end
$$;

update public.profiles
set role = 'creator'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Test 16: role membership and RLS bypass. pg_has_role(..., 'member') includes
-- indirect membership, and client roles must not be superusers or BYPASSRLS.
do $$
declare
  v_role text;
begin
  foreach v_role in array array['service_role', 'postgres', 'supabase_admin'] loop
    if to_regrole(v_role) is not null then
      if pg_has_role('authenticated', v_role, 'member') then
        raise exception 'FAIL test 16: authenticated is a member of %', v_role;
      end if;
      if pg_has_role('anon', v_role, 'member') then
        raise exception 'FAIL test 16: anon is a member of %', v_role;
      end if;
    end if;
  end loop;

  if exists (
    select 1
    from pg_roles
    where rolname in ('anon', 'authenticated')
      and (rolsuper or rolbypassrls)
  ) then
    raise exception 'FAIL test 16: a client role is a superuser or has BYPASSRLS';
  end if;

  if pg_has_role('anon', 'authenticated', 'member') then
    raise exception 'FAIL test 16: anon is a member of authenticated';
  end if;

  raise notice 'PASS test 16: client roles are non-privileged and have no service_role/postgres/supabase_admin membership';
end
$$;

-- Test 17: verify the ACL shape directly, for every current column. This is
-- intentionally not limited to the columns the repository knows about: a live
-- database may carry a legacy full_name column or other column grants.
do $$
declare
  v_public_table_acl integer;
  v_safe text[] := array[
    'id',
    'display_name',
    'username',
    'avatar_url',
    'banner_url',
    'bio',
    'stream_title'
  ];
  v_columns text[];
  v_col text;
  v_role text;
  v_priv text;
  v_name text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_priv in array array[
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ] loop
      if has_table_privilege(v_role::name, 'public.profiles', v_priv) then
        raise exception 'FAIL test 17: % still has table %', v_role, v_priv;
      end if;
    end loop;

    if not has_table_privilege(v_role::name, 'public.profiles', 'SELECT') then
      raise exception 'FAIL test 17: % cannot SELECT profiles', v_role;
    end if;
  end loop;

  select array_agg(a.attname::text order by a.attnum)
  into v_columns
  from pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is null then
    raise exception 'FAIL test 17: public.profiles has no current columns';
  end if;

  foreach v_col in array v_columns loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['INSERT', 'UPDATE'] loop
        if has_column_privilege(v_role::name, 'public.profiles', v_col, v_priv) then
          if v_role = 'authenticated' and v_col = any(v_safe) then
            continue;
          end if;
          raise exception
            'FAIL test 17: % can % column %',
            v_role, v_priv, v_col;
        end if;
      end loop;

      if has_column_privilege(v_role::name, 'public.profiles', v_col, 'REFERENCES') then
        raise exception
          'FAIL test 17: % can REFERENCES column %',
          v_role, v_col;
      end if;
    end loop;
  end loop;

  foreach v_priv in array array['INSERT', 'UPDATE'] loop
    foreach v_name in array v_safe loop
      if not has_column_privilege('authenticated', 'public.profiles', v_name, v_priv) then
        raise exception
          'FAIL test 17: authenticated cannot % safe column %',
          v_priv, v_name;
      end if;
    end loop;
  end loop;

  if not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    raise exception 'FAIL test 17: service_role lost SELECT/INSERT/UPDATE';
  end if;
  foreach v_priv in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('service_role', 'public.profiles', v_priv) then
      raise exception 'FAIL test 17: service_role has %', v_priv;
    end if;
  end loop;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(
         v_role::name,
         'public.streamkit_guard_profile_role()',
         'EXECUTE'
       ) then
      raise exception 'FAIL test 17: % can EXECUTE the trigger function', v_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.streamkit_guard_profile_role()'::regprocedure
      and a.grantee = 0
  ) then
    raise exception 'FAIL test 17: PUBLIC can EXECUTE the trigger function';
  end if;

  select count(*)
  into v_public_table_acl
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.profiles'::regclass
    and a.grantee = 0;

  if v_public_table_acl <> 0 then
    raise exception 'FAIL test 17: PUBLIC has % table ACL entries', v_public_table_acl;
  end if;

  if exists (
    select 1
    from pg_attribute a
    cross join lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
      and x.grantee = 0
  ) then
    raise exception 'FAIL test 17: PUBLIC has column-level ACL entries';
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.profiles'::regclass
      and a.is_grantable
      and a.grantee in (
        select oid from pg_roles where rolname in ('anon', 'authenticated')
      )
  ) then
    raise exception 'FAIL test 17: a client role can grant a table privilege onward';
  end if;

  if exists (
    select 1
    from pg_attribute a
    cross join lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
      and x.is_grantable
      and x.grantee in (
        select oid from pg_roles where rolname in ('anon', 'authenticated')
      )
  ) then
    raise exception 'FAIL test 17: a client role can grant a column privilege onward';
  end if;

  raise notice 'PASS test 17: ACLs are table-read plus safe column writes on every column';
end
$$;

-- Test 18: policy metadata. Exactly the two intended write policies may
-- exist; no DELETE/ALL policy may remain; and public read coverage is checked
-- by shape (permissive, USING true, anon + authenticated), not by an assumed
-- policy name.
do $$
declare
  v_count integer;
  v_roles name[];
  v_permissive text;
  v_cmd text;
  v_qual text;
  v_check text;
begin
  select count(*)
  into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  if v_count <> 2 then
    raise exception
      'FAIL test 18: expected 2 write policies, found %',
      v_count;
  end if;

  select roles, permissive, cmd, qual, with_check
  into v_roles, v_permissive, v_cmd, v_qual, v_check
  from pg_policies
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
    raise exception 'FAIL test 18: INSERT policy is missing or malformed';
  end if;

  select roles, permissive, cmd, qual, with_check
  into v_roles, v_permissive, v_cmd, v_qual, v_check
  from pg_policies
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
    raise exception 'FAIL test 18: UPDATE policy is missing or malformed';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and ('public' = any(roles) or 'anon' = any(roles))
  ) then
    raise exception 'FAIL test 18: PUBLIC or anon still has a write policy';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('DELETE', 'ALL')
  ) then
    raise exception 'FAIL test 18: a DELETE/ALL policy still exists';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'FAIL test 18: a restrictive SELECT policy can override public read';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and ('public' = any(roles) or 'anon' = any(roles))
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
  ) then
    raise exception
      'FAIL test 18: no permissive anon/PUBLIC SELECT policy with USING (true) exists';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and ('public' = any(roles) or 'authenticated' = any(roles))
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
  ) then
    raise exception
      'FAIL test 18: no permissive authenticated/PUBLIC SELECT policy with USING (true) exists';
  end if;

  raise notice 'PASS test 18: policies are SELECT, INSERT-own, UPDATE-own only';
end
$$;

-- Test 19: trigger and function metadata. The trigger must be BEFORE ROW
-- INSERT OR UPDATE, enabled, and backed by a SECURITY INVOKER function with an
-- empty search_path and no direct EXECUTE grant.
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.oid = 'public.profiles'::regclass
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
        where cfg = 'search_path='
      )
  )
  into v_ok;

  if not v_ok then
    raise exception 'FAIL test 19: trigger or function metadata is wrong';
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and not t.tgisinternal
      and t.tgname <> 'streamkit_guard_profile_role'
  ) then
    raise exception 'FAIL test 19: an unexpected trigger exists on public.profiles';
  end if;

  raise notice 'PASS test 19: only the expected BEFORE ROW INSERT OR UPDATE trigger exists and its function metadata is correct';
end
$$;

-- Test 20: failure rollback. This proves PostgreSQL DDL is transactional
-- inside a savepoint. The migration file's own BEGIN/COMMIT wrapper is tested
-- separately by the psql wrapper in the test plan; a manual SQL test cannot
-- prove the wrapper by itself.
savepoint before_simulated_failure;

grant update (role) on table public.profiles to authenticated;

do $$
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') then
    raise exception 'FAIL test 20: simulated grant did not take effect';
  end if;
end
$$;

do $$
begin
  begin
    raise exception 'simulated migration failure';
  exception
    when others then
      null;
  end;
end
$$;

rollback to savepoint before_simulated_failure;

do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') then
    raise exception 'FAIL test 20: rollback did not restore the safe ACL';
  end if;

  raise notice 'PASS test 20: DDL grant rolled back to the safe state';
end
$$;

rollback;

-- After ROLLBACK, verify no scratch users or rows survive:
--   select count(*) from auth.users where email like 'scratch-%@example.test';
--   select count(*) from public.profiles
--    where id in (
--      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
--      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
--      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
--      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
--    );
