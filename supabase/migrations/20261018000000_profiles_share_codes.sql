-- Share codes: snapshot a creator's widget/alert configuration into a short code
-- another creator can selectively import. voice_settings is intentionally excluded
-- because it carries voice-cloning consent that must not be transferred.
--
-- Import replaces each selected section wholesale (delete-then-insert) rather than
-- upserting, so this file never has to enumerate live column names. jsonb_populate_record
-- keeps it tolerant of columns added or removed after a code was generated.

create table if not exists public.profile_share_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_id uuid not null references auth.users(id) on delete cascade,
  sections text[] not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (timezone('utc'::text, now()) + interval '30 days')
);

create index if not exists profile_share_codes_code_idx
  on public.profile_share_codes (code);

alter table public.profile_share_codes enable row level security;

revoke all on table public.profile_share_codes from anon;
revoke all on table public.profile_share_codes from authenticated;
grant select, insert, delete on table public.profile_share_codes to authenticated;
grant all on table public.profile_share_codes to service_role;

drop policy if exists "Creators manage own share codes" on public.profile_share_codes;
create policy "Creators manage own share codes"
  on public.profile_share_codes
  for all
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- Sections a code may carry. Single source of truth for create + import.
create or replace function public.streamkit_share_sections()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array['alerts', 'goals', 'tips', 'spin', 'subathon']::text[];
$$;

-- Snapshots the caller's configuration and returns a fresh code.
create or replace function public.streamkit_create_share_code(p_sections text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_allowed text[] := public.streamkit_share_sections();
  v_sections text[];
  v_payload jsonb := '{}'::jsonb;
  v_code text;
  v_seed text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(array_agg(s order by s), '{}'::text[])
  into v_sections
  from (select distinct unnest(coalesce(p_sections, '{}'::text[]))) s
  where s = any (v_allowed);

  if coalesce(array_length(v_sections, 1), 0) = 0 then
    raise exception 'No valid sections requested';
  end if;

  -- to_jsonb(row) minus identity columns keeps the snapshot stable as columns are added.
  if 'alerts' = any (v_sections) then
    v_payload := v_payload || jsonb_build_object('alerts', coalesce(
      (select jsonb_agg(to_jsonb(t) - 'id' - 'user_id' - 'created_at')
       from public.alert_settings t where t.user_id = v_user), '[]'::jsonb));
  end if;

  if 'goals' = any (v_sections) then
    v_payload := v_payload || jsonb_build_object('goals', coalesce(
      (select jsonb_agg(to_jsonb(g) - 'id' - 'user_id' - 'created_at')
       from public.donation_goals g where g.user_id = v_user), '[]'::jsonb));
  end if;

  if 'tips' = any (v_sections) then
    v_payload := v_payload || jsonb_build_object('tips', coalesce(
      (select jsonb_agg(to_jsonb(s) - 'id' - 'user_id' - 'created_at')
       from public.tip_settings s where s.user_id = v_user), '[]'::jsonb));
  end if;

  if 'spin' = any (v_sections) then
    v_payload := v_payload || jsonb_build_object('spin', coalesce(
      (select jsonb_agg(to_jsonb(w) - 'id' - 'user_id' - 'created_at')
       from public.spin_wheels w where w.user_id = v_user), '[]'::jsonb));
  end if;

  if 'subathon' = any (v_sections) then
    v_payload := v_payload || jsonb_build_object('subathon', coalesce(
      (select jsonb_agg(to_jsonb(b) - 'id' - 'user_id' - 'created_at')
       from public.subathons b where b.user_id = v_user), '[]'::jsonb));
  end if;

  if not exists (select 1 from jsonb_each(v_payload) where value <> '[]'::jsonb) then
    raise exception 'Nothing to share yet — configure a section first';
  end if;

  for i in 1 .. 5 loop
    v_seed := encode(gen_random_bytes(8), 'hex');
    v_code := 'SK-'
      || upper(substr(v_seed, 1, 4)) || '-'
      || upper(substr(v_seed, 5, 4)) || '-'
      || upper(substr(v_seed, 9, 4));

    insert into public.profile_share_codes (code, creator_id, sections, payload)
    values (v_code, v_user, v_sections, v_payload)
    on conflict (code) do nothing;

    if found then
      return v_code;
    end if;
  end loop;

  raise exception 'Could not allocate a unique share code';
end;
$$;

revoke all on function public.streamkit_create_share_code(text[]) from public;
grant execute on function public.streamkit_create_share_code(text[]) to authenticated;

-- Copies the requested sections from a code into the caller's own settings.
create or replace function public.streamkit_import_share_code(
  p_code text,
  p_sections text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_allowed text[] := public.streamkit_share_sections();
  v_available text[];
  v_sections text[];
  v_payload jsonb;
  v_applied text[] := '{}'::text[];
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select s.payload, s.sections
  into v_payload, v_available
  from public.profile_share_codes s
  where upper(trim(s.code)) = upper(trim(p_code))
    and s.expires_at > timezone('utc'::text, now())
  limit 1;

  if v_payload is null then
    raise exception 'Share code is invalid or expired';
  end if;

  select coalesce(array_agg(x order by x), '{}'::text[])
  into v_sections
  from unnest(coalesce(p_sections, '{}'::text[])) x
  where x = any (v_allowed)
    and x = any (v_available);

  if coalesce(array_length(v_sections, 1), 0) = 0 then
    raise exception 'Nothing selected to import';
  end if;

  if 'alerts' = any (v_sections) then
    select coalesce(jsonb_array_length(v_payload -> 'alerts'), 0) into v_count;
    if v_count > 0 then
      delete from public.alert_settings where user_id = v_user;
      insert into public.alert_settings
      select (jsonb_populate_record(null::public.alert_settings, r)).*
      from jsonb_array_elements(v_payload -> 'alerts') as r;
      v_applied := array_append(v_applied, 'alerts');
    end if;
  end if;

  if 'goals' = any (v_sections) then
    select coalesce(jsonb_array_length(v_payload -> 'goals'), 0) into v_count;
    if v_count > 0 then
      delete from public.donation_goals where user_id = v_user;
      insert into public.donation_goals
      select (jsonb_populate_record(null::public.donation_goals, r)).*
      from jsonb_array_elements(v_payload -> 'goals') as r;
      v_applied := array_append(v_applied, 'goals');
    end if;
  end if;

  if 'tips' = any (v_sections) then
    select coalesce(jsonb_array_length(v_payload -> 'tips'), 0) into v_count;
    if v_count > 0 then
      delete from public.tip_settings where user_id = v_user;
      insert into public.tip_settings
      select (jsonb_populate_record(null::public.tip_settings, r)).*
      from jsonb_array_elements(v_payload -> 'tips') as r;
      v_applied := array_append(v_applied, 'tips');
    end if;
  end if;

  if 'spin' = any (v_sections) then
    select coalesce(jsonb_array_length(v_payload -> 'spin'), 0) into v_count;
    if v_count > 0 then
      delete from public.spin_wheels where user_id = v_user;
      insert into public.spin_wheels
      select (jsonb_populate_record(null::public.spin_wheels, r)).*
      from jsonb_array_elements(v_payload -> 'spin') as r;
      v_applied := array_append(v_applied, 'spin');
    end if;
  end if;

  if 'subathon' = any (v_sections) then
    select coalesce(jsonb_array_length(v_payload -> 'subathon'), 0) into v_count;
    if v_count > 0 then
      delete from public.subathons where user_id = v_user;
      insert into public.subathons
      select (jsonb_populate_record(null::public.subathons, r)).*
      from jsonb_array_elements(v_payload -> 'subathon') as r;
      v_applied := array_append(v_applied, 'subathon');
    end if;
  end if;

  if coalesce(array_length(v_applied, 1), 0) = 0 then
    raise exception 'That code had no data for the sections you selected';
  end if;

  return jsonb_build_object('applied', to_jsonb(v_applied));
end;
$$;

revoke all on function public.streamkit_import_share_code(text, text[]) from public;
grant execute on function public.streamkit_import_share_code(text, text[]) to authenticated;