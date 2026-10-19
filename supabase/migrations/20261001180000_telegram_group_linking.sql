create table if not exists public.telegram_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  telegram_chat_id text,
  telegram_chat_title text,
  telegram_chat_type text check (telegram_chat_type in ('group', 'supergroup')),
  linked_by_telegram_user_id text,
  linked_by_telegram_username text,
  group_name text not null default 'Telegram Group',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  link_token_hash text,
  token_expires_at timestamptz,
  linked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_groups_chat_idx
  on public.telegram_groups (telegram_chat_id)
  where telegram_chat_id is not null and status = 'active';
create unique index if not exists telegram_groups_link_token_idx
  on public.telegram_groups (link_token_hash)
  where link_token_hash is not null;
create index if not exists telegram_groups_creator_idx
  on public.telegram_groups (creator_id);

create table if not exists public.telegram_group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.telegram_groups(id) on delete cascade,
  event_type text not null,
  telegram_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists telegram_group_payment_notice_idx
  on public.telegram_group_events (group_id, (metadata ->> 'payment_id'))
  where event_type = 'donation_notification';

alter table public.telegram_groups enable row level security;
alter table public.telegram_group_events enable row level security;
revoke all on table public.telegram_groups from anon, authenticated;
revoke all on table public.telegram_group_events from anon, authenticated;
grant select (
  id, creator_id, telegram_chat_id, telegram_chat_title, telegram_chat_type,
  linked_by_telegram_username, group_name, status, token_expires_at,
  linked_at, last_seen_at, created_at, updated_at
) on table public.telegram_groups to authenticated, service_role;

drop policy if exists "Creators view own Telegram groups" on public.telegram_groups;
create policy "Creators view own Telegram groups"
  on public.telegram_groups for select to authenticated
  using (auth.uid() = creator_id);

create or replace function public.streamkit_set_telegram_group_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

drop trigger if exists telegram_groups_updated_at on public.telegram_groups;
create trigger telegram_groups_updated_at
  before update on public.telegram_groups
  for each row execute function public.streamkit_set_telegram_group_updated_at();

create or replace function public.streamkit_create_telegram_group_link(
  p_group_name text,
  p_link_token_hash text,
  p_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_creator_id is null then
    raise exception 'Authentication required';
  end if;
  if p_link_token_hash is null
    or p_token_expires_at is null
    or p_link_token_hash !~ '^[a-f0-9]{64}$'
    or p_token_expires_at <= now()
    or p_token_expires_at > now() + interval '5 minutes 5 seconds'
  then
    raise exception 'Invalid Telegram group link request';
  end if;

  update public.telegram_groups
  set status = 'revoked', link_token_hash = null, token_expires_at = null
  where creator_id = v_creator_id and status = 'pending';

  insert into public.telegram_groups (
    creator_id, group_name, status, link_token_hash, token_expires_at
  ) values (
    v_creator_id,
    coalesce(nullif(trim(p_group_name), ''), 'Telegram Group'),
    'pending',
    p_link_token_hash,
    p_token_expires_at
  ) returning id into v_group_id;

  return v_group_id;
end
$function$;

revoke all on function public.streamkit_create_telegram_group_link(text, text, timestamptz)
  from public, anon;
grant execute on function public.streamkit_create_telegram_group_link(text, text, timestamptz)
  to authenticated;

create or replace function public.streamkit_link_telegram_group(
  p_link_token_hash text,
  p_telegram_chat_id text,
  p_telegram_chat_title text,
  p_telegram_chat_type text,
  p_telegram_user_id text,
  p_telegram_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group public.telegram_groups%rowtype;
begin
  if p_link_token_hash is null
    or p_telegram_chat_id is null
    or p_telegram_chat_type is null
    or p_telegram_user_id is null
    or p_link_token_hash !~ '^[a-f0-9]{64}$'
    or p_telegram_chat_id !~ '^-?[0-9]{1,20}$'
    or p_telegram_chat_type not in ('group', 'supergroup')
    or p_telegram_user_id !~ '^[0-9]{1,20}$'
    or (p_telegram_username is not null
      and p_telegram_username !~ '^[A-Za-z0-9_]{5,32}$')
  then
    return null;
  end if;

  select * into v_group
  from public.telegram_groups
  where link_token_hash = p_link_token_hash
    and status = 'pending'
    and token_expires_at > now()
  for update;

  if not found then
    return null;
  end if;

  begin
    update public.telegram_groups
    set telegram_chat_id = p_telegram_chat_id,
        telegram_chat_title = nullif(trim(p_telegram_chat_title), ''),
        telegram_chat_type = p_telegram_chat_type,
        linked_by_telegram_user_id = p_telegram_user_id,
        linked_by_telegram_username = p_telegram_username,
        group_name = coalesce(nullif(trim(p_telegram_chat_title), ''), group_name),
        status = 'active',
        linked_at = now(),
        last_seen_at = now(),
        link_token_hash = null,
        token_expires_at = null
    where id = v_group.id;
  exception when unique_violation then
    return null;
  end;

  insert into public.telegram_group_events (
    group_id, event_type, telegram_user_id, metadata
  ) values (
    v_group.id,
    'group_linked',
    p_telegram_user_id,
    jsonb_build_object(
      'telegram_chat_id', p_telegram_chat_id,
      'telegram_chat_type', p_telegram_chat_type
    )
  );

  return jsonb_build_object(
    'group_id', v_group.id,
    'creator_id', v_group.creator_id,
    'group_name', coalesce(nullif(trim(p_telegram_chat_title), ''), v_group.group_name)
  );
end
$function$;

revoke all on function public.streamkit_link_telegram_group(text, text, text, text, text, text)
  from public;
grant execute on function public.streamkit_link_telegram_group(text, text, text, text, text, text)
  to anon, authenticated;

create or replace function public.streamkit_revoke_telegram_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text;
begin
  update public.telegram_groups
  set status = 'revoked',
      telegram_chat_id = null,
      link_token_hash = null,
      token_expires_at = null
  where id = p_group_id
    and creator_id = auth.uid()
    and status = 'active'
  returning linked_by_telegram_user_id into v_telegram_user_id;

  if not found then
    return false;
  end if;

  insert into public.telegram_group_events (
    group_id, event_type, telegram_user_id
  ) values (p_group_id, 'group_revoked', v_telegram_user_id);

  return true;
end
$function$;

revoke all on function public.streamkit_revoke_telegram_group(uuid)
  from public, anon;
grant execute on function public.streamkit_revoke_telegram_group(uuid)
  to authenticated;

create or replace function public.streamkit_touch_telegram_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.telegram_groups
  set last_seen_at = now()
  where id = p_group_id
    and creator_id = auth.uid()
    and status = 'active';

  if not found then
    return false;
  end if;

  insert into public.telegram_group_events (
    group_id, event_type, telegram_user_id
  )
  select id, 'connection_tested', linked_by_telegram_user_id
  from public.telegram_groups
  where id = p_group_id;

  return true;
end
$function$;

revoke all on function public.streamkit_touch_telegram_group(uuid)
  from public, anon;
grant execute on function public.streamkit_touch_telegram_group(uuid)
  to authenticated;

create or replace function public.streamkit_claim_telegram_group_notification(
  p_group_id uuid,
  p_creator_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group public.telegram_groups%rowtype;
  v_event_id uuid;
begin
  select * into v_group
  from public.telegram_groups
  where id = p_group_id
    and creator_id = p_creator_id
    and status = 'active'
  for update;

  if not found or v_group.telegram_chat_id is null then
    return null;
  end if;

  insert into public.telegram_group_events (
    group_id, event_type, telegram_user_id, metadata
  ) values (
    v_group.id,
    'donation_notification',
    v_group.linked_by_telegram_user_id,
    jsonb_build_object('payment_id', p_payment_id, 'status', 'sending')
  )
  on conflict (group_id, (metadata ->> 'payment_id'))
    where event_type = 'donation_notification'
  do update set
    metadata = jsonb_build_object('payment_id', p_payment_id, 'status', 'sending'),
    created_at = now()
  where public.telegram_group_events.metadata ->> 'status' = 'failed'
    or (
      public.telegram_group_events.metadata ->> 'status' = 'sending'
      and public.telegram_group_events.created_at < now() - interval '1 minute'
    )
  returning id into v_event_id;

  if v_event_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'chat_id', v_group.telegram_chat_id
  );
end
$function$;

revoke all on function public.streamkit_claim_telegram_group_notification(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.streamkit_claim_telegram_group_notification(uuid, uuid, uuid)
  to service_role;

-- telegram_group_events is read and written by server routes through createAdminClient(),
-- which runs as service_role. That role does not inherit from anon or
-- authenticated, so a grant to authenticated alone leaves it locked out:
-- PostgREST answers 42501 and the route fails with "permission denied for
-- table telegram_group_events". RLS is separate -- it narrows what a granted role may do,
-- it never grants table access.
grant select, insert, update, delete on table public.telegram_group_events to authenticated, service_role;


-- service_role needs full DML on telegram_group_events because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.telegram_group_events to service_role;
