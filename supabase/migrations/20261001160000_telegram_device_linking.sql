create table if not exists public.telegram_devices (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  telegram_user_id text,
  telegram_username text,
  telegram_chat_id text,
  device_name text not null default 'Telegram Device',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  link_token_hash text,
  token_expires_at timestamptz,
  linked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_devices_user_idx
  on public.telegram_devices (telegram_user_id)
  where telegram_user_id is not null;
create index if not exists telegram_devices_creator_idx
  on public.telegram_devices (creator_id);
create unique index if not exists telegram_devices_link_token_idx
  on public.telegram_devices (link_token_hash)
  where link_token_hash is not null;

create table if not exists public.telegram_device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.telegram_devices(id) on delete cascade,
  event_type text not null,
  telegram_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists telegram_device_payment_notice_idx
  on public.telegram_device_events ((metadata ->> 'payment_id'))
  where event_type = 'donation_notification';

alter table public.telegram_devices enable row level security;
alter table public.telegram_device_events enable row level security;
revoke all on table public.telegram_devices from anon, authenticated;
revoke all on table public.telegram_device_events from anon, authenticated;
grant select (
  id, creator_id, telegram_user_id, telegram_username, telegram_chat_id,
  device_name, status, token_expires_at, linked_at, last_seen_at,
  created_at, updated_at
) on public.telegram_devices to authenticated;

drop policy if exists "Creators view own Telegram devices" on public.telegram_devices;
create policy "Creators view own Telegram devices"
  on public.telegram_devices for select to authenticated
  using (auth.uid() = creator_id);

create or replace function public.streamkit_set_telegram_device_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

drop trigger if exists telegram_devices_updated_at on public.telegram_devices;
create trigger telegram_devices_updated_at
  before update on public.telegram_devices
  for each row execute function public.streamkit_set_telegram_device_updated_at();

create or replace function public.streamkit_create_telegram_device(
  p_device_name text,
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
  v_device_id uuid;
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
    raise exception 'Invalid Telegram link request';
  end if;

  update public.telegram_devices
  set status = 'revoked', link_token_hash = null, token_expires_at = null
  where creator_id = v_creator_id and status = 'pending';

  insert into public.telegram_devices (
    creator_id, device_name, status, link_token_hash, token_expires_at
  ) values (
    v_creator_id,
    coalesce(nullif(trim(p_device_name), ''), 'Telegram Payment Bot'),
    'pending',
    p_link_token_hash,
    p_token_expires_at
  ) returning id into v_device_id;

  return v_device_id;
end
$function$;

revoke all on function public.streamkit_create_telegram_device(text, text, timestamptz)
  from public, anon;
grant execute on function public.streamkit_create_telegram_device(text, text, timestamptz)
  to authenticated;

create or replace function public.streamkit_link_telegram_device(
  p_link_token_hash text,
  p_telegram_user_id text,
  p_telegram_username text,
  p_telegram_chat_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.telegram_devices%rowtype;
begin
  if p_link_token_hash !~ '^[a-f0-9]{64}$'
    or p_telegram_user_id !~ '^[0-9]{1,20}$'
    or p_telegram_chat_id !~ '^-?[0-9]{1,20}$'
    or (p_telegram_username is not null
      and p_telegram_username !~ '^[A-Za-z0-9_]{5,32}$')
  then
    return null;
  end if;

  select * into v_device
  from public.telegram_devices
  where link_token_hash = p_link_token_hash
    and status = 'pending'
    and token_expires_at > now()
  for update;

  if not found then
    return null;
  end if;

  begin
    update public.telegram_devices
    set telegram_user_id = p_telegram_user_id,
        telegram_username = p_telegram_username,
        telegram_chat_id = p_telegram_chat_id,
        status = 'active',
        linked_at = now(),
        last_seen_at = now(),
        link_token_hash = null,
        token_expires_at = null
    where id = v_device.id;
  exception when unique_violation then
    return null;
  end;

  insert into public.telegram_device_events (
    device_id, event_type, telegram_user_id, metadata
  ) values (
    v_device.id,
    'device_linked',
    p_telegram_user_id,
    jsonb_build_object('telegram_username', p_telegram_username)
  );

  return jsonb_build_object(
    'device_id', v_device.id,
    'creator_id', v_device.creator_id,
    'device_name', v_device.device_name
  );
end
$function$;

revoke all on function public.streamkit_link_telegram_device(text, text, text, text)
  from public;
grant execute on function public.streamkit_link_telegram_device(text, text, text, text)
  to anon, authenticated;

create or replace function public.streamkit_revoke_telegram_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text;
begin
  update public.telegram_devices
  set status = 'revoked',
      telegram_user_id = null,
      telegram_username = null,
      telegram_chat_id = null,
      link_token_hash = null,
      token_expires_at = null
  where id = p_device_id
    and creator_id = auth.uid()
    and status = 'active'
  returning telegram_user_id into v_telegram_user_id;

  if not found then
    return false;
  end if;

  insert into public.telegram_device_events (
    device_id, event_type, telegram_user_id
  ) values (p_device_id, 'device_revoked', v_telegram_user_id);

  return true;
end
$function$;

revoke all on function public.streamkit_revoke_telegram_device(uuid)
  from public, anon;
grant execute on function public.streamkit_revoke_telegram_device(uuid)
  to authenticated;

create or replace function public.streamkit_touch_telegram_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text;
begin
  update public.telegram_devices
  set last_seen_at = now()
  where id = p_device_id
    and creator_id = auth.uid()
    and status = 'active'
  returning telegram_user_id into v_telegram_user_id;

  if not found then
    return false;
  end if;

  insert into public.telegram_device_events (
    device_id, event_type, telegram_user_id
  ) values (p_device_id, 'connection_tested', v_telegram_user_id);

  return found;
end
$function$;

revoke all on function public.streamkit_touch_telegram_device(uuid)
  from public, anon;
grant execute on function public.streamkit_touch_telegram_device(uuid)
  to authenticated;