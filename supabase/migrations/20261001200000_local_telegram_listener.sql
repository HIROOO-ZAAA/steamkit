create table if not exists public.telegram_local_agents (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  telegram_chat_id text not null,
  payway_bot_username text not null,
  expected_sender_user_id text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists telegram_local_agents_active_creator_idx
  on public.telegram_local_agents (creator_id)
  where revoked_at is null;

create table if not exists public.telegram_aba_notifications (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  telegram_chat_id text not null,
  telegram_chat_title text,
  telegram_message_id bigint not null,
  sender_user_id text not null,
  sender_username text not null,
  message_text text not null check (char_length(message_text) <= 4000),
  telegram_sent_at timestamptz,
  received_at timestamptz not null default now(),
  unique (telegram_chat_id, telegram_message_id)
);

create index if not exists telegram_aba_notifications_creator_received_idx
  on public.telegram_aba_notifications (creator_id, received_at desc);

alter table public.telegram_local_agents enable row level security;
alter table public.telegram_aba_notifications enable row level security;
revoke all on table public.telegram_local_agents from anon, authenticated;
revoke all on table public.telegram_aba_notifications from anon, authenticated;
grant select (
  id, creator_id, telegram_chat_id, payway_bot_username,
  last_seen_at, created_at, revoked_at
) on public.telegram_local_agents to authenticated;
grant select on public.telegram_aba_notifications to authenticated;

drop policy if exists "Creators view own Telegram local agent" on public.telegram_local_agents;
create policy "Creators view own Telegram local agent"
  on public.telegram_local_agents for select to authenticated
  using (auth.uid() = creator_id);

drop policy if exists "Creators view own Telegram ABA notifications" on public.telegram_aba_notifications;
create policy "Creators view own Telegram ABA notifications"
  on public.telegram_aba_notifications for select to authenticated
  using (auth.uid() = creator_id);

create or replace function public.streamkit_create_local_telegram_agent(
  p_token_hash text,
  p_telegram_chat_id text,
  p_payway_bot_username text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := auth.uid();
  v_agent_id uuid;
begin
  if v_creator_id is null then
    raise exception 'Authentication required';
  end if;
  if p_token_hash is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_telegram_chat_id is null
    or p_telegram_chat_id !~ '^-?[0-9]{1,20}$'
    or p_payway_bot_username is null
    or p_payway_bot_username !~ '^[A-Za-z0-9_]{5,32}$'
  then
    raise exception 'Invalid local Telegram listener configuration';
  end if;

  insert into public.profiles (id)
  values (v_creator_id)
  on conflict (id) do nothing;

  update public.telegram_local_agents
  set revoked_at = now()
  where creator_id = v_creator_id and revoked_at is null;

  insert into public.telegram_local_agents (
    creator_id, token_hash, telegram_chat_id, payway_bot_username
  ) values (
    v_creator_id, p_token_hash, p_telegram_chat_id,
    lower(regexp_replace(p_payway_bot_username, '^@', ''))
  ) returning id into v_agent_id;

  return v_agent_id;
end
$function$;

revoke all on function public.streamkit_create_local_telegram_agent(text, text, text)
  from public, anon;
grant execute on function public.streamkit_create_local_telegram_agent(text, text, text)
  to authenticated;

create or replace function public.streamkit_revoke_local_telegram_agent(p_agent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.telegram_local_agents
  set revoked_at = now()
  where id = p_agent_id
    and creator_id = auth.uid()
    and revoked_at is null;
  return found;
end
$function$;

revoke all on function public.streamkit_revoke_local_telegram_agent(uuid)
  from public, anon;
grant execute on function public.streamkit_revoke_local_telegram_agent(uuid)
  to authenticated;

create or replace function public.streamkit_register_local_telegram_sender(
  p_token_hash text,
  p_sender_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_token_hash is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_sender_user_id is null
    or p_sender_user_id !~ '^[0-9]{1,20}$'
  then
    return false;
  end if;

  update public.telegram_local_agents
  set expected_sender_user_id = p_sender_user_id
  where token_hash = p_token_hash and revoked_at is null;
  return found;
end
$function$;

revoke all on function public.streamkit_register_local_telegram_sender(text, text)
  from public;
grant execute on function public.streamkit_register_local_telegram_sender(text, text)
  to anon, authenticated;

create or replace function public.streamkit_ingest_telegram_aba_message(
  p_token_hash text,
  p_telegram_chat_id text,
  p_telegram_chat_title text,
  p_telegram_message_id bigint,
  p_sender_user_id text,
  p_sender_username text,
  p_message_text text,
  p_telegram_sent_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agent public.telegram_local_agents%rowtype;
  v_notification_id uuid;
begin
  if p_token_hash is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_telegram_chat_id is null
    or p_telegram_chat_id !~ '^-?[0-9]{1,20}$'
    or p_telegram_message_id is null
    or p_sender_user_id is null
    or p_sender_user_id !~ '^[0-9]{1,20}$'
    or p_sender_username is null
    or p_message_text is null
    or char_length(p_message_text) > 4000
  then
    return null;
  end if;

  select * into v_agent
  from public.telegram_local_agents
  where token_hash = p_token_hash
    and telegram_chat_id = p_telegram_chat_id
    and payway_bot_username = lower(p_sender_username)
    and expected_sender_user_id = p_sender_user_id
    and revoked_at is null
  for update;

  if not found then
    return null;
  end if;

  insert into public.telegram_aba_notifications (
    creator_id, telegram_chat_id, telegram_chat_title,
    telegram_message_id, sender_user_id, sender_username,
    message_text, telegram_sent_at
  ) values (
    v_agent.creator_id, p_telegram_chat_id,
    left(nullif(trim(p_telegram_chat_title), ''), 120),
    p_telegram_message_id, p_sender_user_id,
    lower(p_sender_username), trim(p_message_text), p_telegram_sent_at
  )
  on conflict (telegram_chat_id, telegram_message_id) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;

  update public.telegram_local_agents
  set last_seen_at = now()
  where id = v_agent.id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'notification_id', v_notification_id
  );
end
$function$;

revoke all on function public.streamkit_ingest_telegram_aba_message(text, text, text, bigint, text, text, text, timestamptz)
  from public;
grant execute on function public.streamkit_ingest_telegram_aba_message(text, text, text, bigint, text, text, text, timestamptz)
  to anon, authenticated;