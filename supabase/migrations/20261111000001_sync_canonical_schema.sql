-- Sync canonical schema with all tables and RPCs from applied migrations
-- This migration documents the current live state; it does not create new objects
-- (they already exist from earlier migrations). Run verify:migrations to confirm.

-- ============================================================
-- TABLES MISSING FROM supabase_schema.sql (created in earlier migrations)
-- ============================================================

-- donations (from 20261001130000_payments_aba_payway.sql)
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  donor_name text not null,
  message text,
  amount numeric not null,
  currency text not null,
  status text not null default 'pending',
  photo_path text,
  photo_status text not null default 'none',
  voice_path text,
  voice_duration_seconds integer,
  created_at timestamptz default now()
);

alter table public.donations enable row level security;
revoke all on table public.donations from anon, authenticated;
grant select on table public.donations to authenticated, service_role;
grant insert, update, delete on table public.donations to service_role;

drop policy if exists "Creators view own donations" on public.donations;
create policy "Creators view own donations"
  on public.donations for select to authenticated
  using (auth.uid() = creator_id);

-- payment_webhooks (from 20261001130000_payments_aba_payway.sql)
create table if not exists public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  tran_id text not null,
  event_type text not null,
  payload jsonb not null,
  signature text,
  processed boolean not null default false,
  created_at timestamptz default now()
);

alter table public.payment_webhooks enable row level security;
revoke all on table public.payment_webhooks from anon, authenticated;
grant all on table public.payment_webhooks to service_role;

-- telegram_devices (from 20261001160000_telegram_device_linking.sql)
create table if not exists public.telegram_devices (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null,
  device_id text not null,
  public_key text not null,
  created_at timestamptz default now(),
  unique (creator_id, device_id)
);

alter table public.telegram_devices enable row level security;
revoke all on table public.telegram_devices from anon, authenticated;
grant all on table public.telegram_devices to authenticated, service_role;

drop policy if exists "Creators manage own telegram devices" on public.telegram_devices;
create policy "Creators manage own telegram devices"
  on public.telegram_devices for all to authenticated
  using (auth.uid() = creator_id);

-- telegram_device_events (from 20261001160000_telegram_device_linking.sql)
create table if not exists public.telegram_device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.telegram_devices(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.telegram_device_events enable row level security;
revoke all on table public.telegram_device_events from anon, authenticated;
grant all on table public.telegram_device_events to authenticated, service_role;

drop policy if exists "Creators view own device events" on public.telegram_device_events;
create policy "Creators view own device events"
  on public.telegram_device_events for select to authenticated
  using (exists (
    select 1 from public.telegram_devices d
    where d.id = telegram_device_events.device_id
    and d.creator_id = auth.uid()
  ));

-- telegram_groups (from 20261001180000_telegram_group_linking.sql)
create table if not exists public.telegram_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  chat_id text not null,
  chat_title text,
  bot_username text not null,
  agent_token_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (creator_id, chat_id)
);

alter table public.telegram_groups enable row level security;
revoke all on table public.telegram_groups from anon, authenticated;
grant all on table public.telegram_groups to authenticated, service_role;

drop policy if exists "Creators manage own telegram groups" on public.telegram_groups;
create policy "Creators manage own telegram groups"
  on public.telegram_groups for all to authenticated
  using (auth.uid() = creator_id);

-- telegram_group_events (from 20261001180000_telegram_group_linking.sql)
create table if not exists public.telegram_group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.telegram_groups(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.telegram_group_events enable row level security;
revoke all on table public.telegram_group_events from anon, authenticated;
grant all on table public.telegram_group_events to authenticated, service_role;

drop policy if exists "Creators view own group events" on public.telegram_group_events;
create policy "Creators view own group events"
  on public.telegram_group_events for select to authenticated
  using (exists (
    select 1 from public.telegram_groups g
    where g.id = telegram_group_events.group_id
    and g.creator_id = auth.uid()
  ));

-- telegram_local_agents (from 20261001200000_telegram_local_listener.sql)
create table if not exists public.telegram_local_agents (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  agent_token_hash text not null unique,
  telegram_chat_id text not null,
  payway_bot_username text not null,
  created_at timestamptz default now()
);

alter table public.telegram_local_agents enable row level security;
revoke all on table public.telegram_local_agents from anon, authenticated;
grant all on table public.telegram_local_agents to authenticated, service_role;

drop policy if exists "Creators manage own local agents" on public.telegram_local_agents;
create policy "Creators manage own local agents"
  on public.telegram_local_agents for all to authenticated
  using (auth.uid() = creator_id);

-- telegram_aba_notifications (from 20261001200000_telegram_local_listener.sql)
create table if not exists public.telegram_aba_notifications (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.telegram_local_agents(id) on delete cascade,
  telegram_message_id text not null,
  parsed_tip jsonb,
  recorded_at timestamptz default now()
);

alter table public.telegram_aba_notifications enable row level security;
revoke all on table public.telegram_aba_notifications from anon, authenticated;
grant all on table public.telegram_aba_notifications to service_role;

-- voice_clones (from 20261017000000_voice_clones_table.sql + 20261017000002_voice_clones_owner_id.sql)
create table if not exists public.voice_clones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  voicestudio_voice_id text,
  consent_at timestamptz,
  provider text not null default 'voicestudio',
  created_at timestamptz default now()
);

alter table public.voice_clones enable row level security;
revoke all on table public.voice_clones from anon, authenticated;
grant all on table public.voice_clones to authenticated, service_role;

drop policy if exists "Owners manage own voice clones" on public.voice_clones;
create policy "Owners manage own voice clones"
  on public.voice_clones for all to authenticated
  using (auth.uid() = owner_id);

-- login_sessions (from 20261017000001_auth_login_sessions.sql)
create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

alter table public.login_sessions enable row level security;
revoke all on table public.login_sessions from anon, authenticated;
grant all on table public.login_sessions to service_role;
grant select on table public.login_sessions to authenticated;

drop policy if exists "Users view own login sessions" on public.login_sessions;
create policy "Users view own login sessions"
  on public.login_sessions for select to authenticated
  using (auth.uid() = user_id);

-- profile_share_codes (from 20261018000000_profiles_share_codes.sql)
create table if not exists public.profile_share_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  sections text[] not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table public.profile_share_codes enable row level security;
revoke all on table public.profile_share_codes from anon, authenticated;
grant all on table public.profile_share_codes to authenticated, service_role;

drop policy if exists "Users manage own share codes" on public.profile_share_codes;
create policy "Users manage own share codes"
  on public.profile_share_codes for all to authenticated
  using (auth.uid() = user_id);

-- payment_merchant_credentials (from 20261019000001_payments_merchant_credentials.sql)
create table if not exists public.payment_merchant_credentials (
  provider text primary key,
  env text not null default 'sandbox',
  merchant_id text,
  merchant_name text,
  merchant_city text,
  api_key text,
  secret_key text,
  callback_url text,
  status text not null default 'unconfigured',
  validated_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.payment_merchant_credentials enable row level security;
revoke all on table public.payment_merchant_credentials from anon, authenticated;
grant all on table public.payment_merchant_credentials to service_role;

-- alert_tiers (from 20261019000007_alerts_tiers.sql)
create table if not exists public.alert_tiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  min_amount numeric not null,
  max_amount numeric,
  currency text not null,
  message_template text,
  sound_url text,
  animation_type text,
  duration_seconds integer,
  tts_enabled boolean,
  tts_volume integer,
  layout text,
  image_url text,
  image_scale integer,
  show_donor_profile boolean,
  text_color text,
  bg_color text,
  enable_card boolean,
  font_family text,
  font_size integer,
  font_weight text,
  alert_animation text,
  text_animation text,
  text_delay integer,
  donor_avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.alert_tiers enable row level security;
revoke all on table public.alert_tiers from anon, authenticated;
grant all on table public.alert_tiers to authenticated, service_role;

drop policy if exists "Users manage own alert tiers" on public.alert_tiers;
create policy "Users manage own alert tiers"
  on public.alert_tiers for all to authenticated
  using (auth.uid() = user_id);

-- alert_voice_intro (from 20261019000007_alerts_tiers.sql)
create table if not exists public.alert_voice_intro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  template text not null default '{name} sent a voice message',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table public.alert_voice_intro enable row level security;
revoke all on table public.alert_voice_intro from anon, authenticated;
grant all on table public.alert_voice_intro to authenticated, service_role;

drop policy if exists "Users manage own voice intro" on public.alert_voice_intro;
create policy "Users manage own voice intro"
  on public.alert_voice_intro for all to authenticated
  using (auth.uid() = user_id);

-- spin_wheel_spins (from 20261015000002_draws_server_authoritative.sql)
create table if not exists public.spin_wheel_spins (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  winner_segment_id uuid,
  winner_segment_label text,
  winner_segment_probability numeric,
  created_at timestamptz default now()
);

alter table public.spin_wheel_spins enable row level security;
revoke all on table public.spin_wheel_spins from anon, authenticated;
grant all on table public.spin_wheel_spins to authenticated, service_role;

drop policy if exists "Users view own spin wheel spins" on public.spin_wheel_spins;
create policy "Users view own spin wheel spins"
  on public.spin_wheel_spins for select to authenticated
  using (exists (
    select 1 from public.spin_wheels w
    where w.id = spin_wheel_spins.wheel_id
    and w.user_id = auth.uid()
  ));

-- alert_overlay_claims (from 20261021000001_alert_overlay_claims.sql)
create table if not exists public.alert_overlay_claims (
  tip_id uuid primary key references public.tips(id) on delete cascade,
  overlay_token text not null,
  claimed_at timestamptz default now()
);

alter table public.alert_overlay_claims enable row level security;
revoke all on table public.alert_overlay_claims from anon, authenticated;
grant all on table public.alert_overlay_claims to service_role;

-- goal_manual_adjustments (from 20261110000000_goal_manual_adjustments.sql)
create table if not exists public.goal_manual_adjustments (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.donation_goals(id) on delete cascade,
  amount numeric not null,
  reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.goal_manual_adjustments enable row level security;
revoke all on table public.goal_manual_adjustments from anon, authenticated;
grant all on table public.goal_manual_adjustments to authenticated, service_role;

drop policy if exists "Creators manage own goal adjustments" on public.goal_manual_adjustments;
create policy "Creators manage own goal adjustments"
  on public.goal_manual_adjustments for all to authenticated
  using (exists (
    select 1 from public.donation_goals g
    where g.id = goal_manual_adjustments.goal_id
    and g.user_id = auth.uid()
  ));

-- ============================================================
-- RPCs MISSING FROM supabase_schema.sql (created in earlier migrations)
-- ============================================================

create or replace function public.streamkit_complete_aba_payment(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_provider_paid_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_subscription_tier_id uuid;
  v_subscription_id uuid;
  v_is_subscription boolean := false;
begin
  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status in ('successful', 'completed') then
    return;
  end if;

  if v_payment.provider is distinct from 'aba_payway'
    or v_payment.status not in ('pending', 'processing') then
    raise exception 'Payment intent is not payable';
  end if;

  if p_verified_amount is null
    or p_verified_currency is null
    or p_provider_paid_at is null
    or v_payment.expires_at is null
    or p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at then
    raise exception 'Verified transaction does not match payment intent';
  end if;

  update public.payment_transactions
  set status = 'successful',
      provider_transaction_id = p_provider_transaction_id,
      provider_paid_at = p_provider_paid_at,
      updated_at = now()
  where id = v_payment.id;

  v_subscription_tier_id := (v_payment.metadata ->> 'subscription_tier_id')::uuid;
  v_is_subscription := v_subscription_tier_id is not null;

  if v_is_subscription then
    insert into public.subscriptions (
      tier_id,
      creator_id,
      user_id,
      status,
      current_period_start,
      current_period_end,
      payment_provider,
      provider_subscription_id,
      provider_customer_id,
      last_payment_id,
      metadata
    ) values (
      v_subscription_tier_id,
      v_payment.creator_id,
      case when v_payment.metadata ->> 'subscriber_id' is not null
        then (v_payment.metadata ->> 'subscriber_id')::uuid
        else v_payment.creator_id
      end,
      'active',
      now(),
      now() + interval '1 month',
      'aba_payway',
      v_payment.metadata ->> 'provider_subscription_id',
      v_payment.metadata ->> 'provider_customer_id',
      v_payment.id,
      v_payment.metadata
    ) returning id into v_subscription_id;

    update public.payment_transactions
    set subscription_id = v_subscription_id,
        subscription_type = 'new'
    where id = v_payment.id;
  else
    update public.donations
    set status = 'completed',
        updated_at = now()
    where id = v_payment.donation_id;

    insert into public.tips (
      creator_id, tipper_name, amount, currency, message,
      payment_method, payment_status, payment_transaction_id
    ) values (
      v_payment.creator_id,
      v_payment.donor_name,
      v_payment.amount,
      v_payment.currency,
      v_payment.message,
      'aba_payway',
      'successful',
      v_payment.id
    )
    on conflict do nothing;
  end if;
end
$function$;

revoke all on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz) to service_role;

-- streamkit_transition_aba_payment (from 20261109000000_aba_atomic_terminal_transitions.sql)
create or replace function public.streamkit_transition_aba_payment(
  p_payment_id uuid,
  p_target_status text,
  p_failure_reason text default null,
  p_webhook_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_donation_id uuid;
  v_current_status text;
  v_donation_status text;
begin
  if p_target_status is null or p_target_status not in (
    'expired', 'failed', 'cancelled', 'refunded', 'review_required'
  ) then
    raise exception 'Invalid target status: %', p_target_status;
  end if;

  select donation_id, status
  into v_donation_id, v_current_status
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_current_status not in ('pending', 'processing') then
    return; -- Already terminal, idempotent
  end if;

  -- Determine donation status based on payment status
  case p_target_status
    when 'expired' then v_donation_status := 'expired';
    when 'failed' then v_donation_status := 'failed';
    when 'cancelled' then v_donation_status := 'cancelled';
    when 'refunded' then v_donation_status := 'refunded';
    when 'review_required' then v_donation_status := 'review_required';
    else v_donation_status := 'failed';
  end case;

  update public.payment_transactions
  set status = p_target_status,
      failure_reason = p_failure_reason,
      updated_at = now()
  where id = p_payment_id;

  update public.donations
  set status = v_donation_status,
      updated_at = now()
  where id = v_donation_id;

  if p_webhook_id is not null then
    update public.payment_webhooks
    set processed = true
    where id = p_webhook_id;
  end if;
end;
$function$;

revoke all on function public.streamkit_transition_aba_payment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.streamkit_transition_aba_payment(uuid, text, text, uuid) to service_role;

-- streamkit_recent_alerts (from 20261019000009_alerts_donation_voice_messages.sql)
create or replace function public.streamkit_recent_alerts(
  p_token text,
  p_since timestamptz
) returns table (
  id uuid,
  creator_id uuid,
  tipper_name text,
  amount numeric,
  currency text,
  message text,
  payment_method text,
  payment_status text,
  played_in_overlay boolean,
  created_at timestamptz,
  photo_path text,
  photo_status text,
  voice_path text,
  voice_duration_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  select
    t.id,
    t.creator_id,
    t.tipper_name,
    t.amount,
    t.currency,
    t.message,
    t.payment_method,
    t.payment_status,
    t.played_in_overlay,
    t.created_at,
    t.photo_path,
    t.photo_status,
    t.voice_path,
    t.voice_duration_seconds
  from public.tips t
  join public.streamkit_overlay_credentials oc on oc.creator_id = t.creator_id
  where oc.token = p_token
    and t.created_at > p_since
    and t.payment_status in ('successful', 'test')
  order by t.created_at asc;
end;
$function$;

revoke all on function public.streamkit_recent_alerts(text, timestamptz) from public;
grant execute on function public.streamkit_recent_alerts(text, timestamptz) to anon, authenticated;

-- streamkit_create_local_telegram_agent (from 20261001200000_telegram_local_listener.sql)
-- SECURE VERSION: uses auth.uid() for ownership enforcement, soft-revokes only caller's agent
create or replace function public.streamkit_create_local_telegram_agent(
  p_token_hash text,
  p_telegram_chat_id text,
  p_payway_bot_username text
) returns uuid
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

-- streamkit_register_local_telegram_sender (from 20261001200000_telegram_local_listener.sql)
create or replace function public.streamkit_register_local_telegram_sender(
  p_token_hash text,
  p_sender_user_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agent_id uuid;
begin
  select id into v_agent_id
  from public.telegram_local_agents
  where agent_token_hash = p_token_hash;

  if not found then
    return false;
  end if;

  update public.telegram_local_agents
  set sender_user_id = p_sender_user_id
  where id = v_agent_id;

  return true;
end;
$function$;

revoke all on function public.streamkit_register_local_telegram_sender(text, text) from public;
grant execute on function public.streamkit_register_local_telegram_sender(text, text) to service_role;

-- streamkit_record_parsed_aba_tip (from 20261010000000_telegram_aba_tip_parser.sql)
create or replace function public.streamkit_record_parsed_aba_tip(
  p_token_hash text,
  p_telegram_chat_id text,
  p_telegram_chat_title text,
  p_telegram_message_id text,
  p_sender_user_id text,
  p_sender_username text,
  p_message_text text,
  p_telegram_sent_at timestamptz,
  p_tipper_name text,
  p_amount numeric,
  p_currency text,
  p_tip_message text
) returns table (
  accepted boolean,
  duplicate boolean,
  reason text,
  donation_id uuid,
  tip_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agent record;
  v_donation_id uuid;
  v_tip_id uuid;
  v_creator_id uuid;
begin
  select * into v_agent
  from public.telegram_local_agents
  where agent_token_hash = p_token_hash;

  if not found then
    return query select false, false, 'invalid_token', null, null;
  end if;

  if v_agent.sender_user_id != p_sender_user_id then
    return query select false, false, 'sender_mismatch', null, null;
  end if;

  select creator_id into v_creator_id
  from public.telegram_groups
  where chat_id = p_telegram_chat_id
    and creator_id = v_agent.creator_id;

  if not found then
    return query select false, false, 'group_not_linked', null, null;
  end if;

  -- Check for duplicate
  select id into v_tip_id
  from public.tips
  where payment_method = 'aba_telegram'
    and payment_transaction_id = p_telegram_message_id;

  if found then
    return query select true, true, 'duplicate', null, v_tip_id;
  end if;

  -- Create donation
  v_donation_id := gen_random_uuid();
  insert into public.donations (id, creator_id, donor_name, message, amount, currency, status, photo_status)
  values (v_donation_id, v_creator_id, p_tipper_name, p_tip_message, p_amount, p_currency, 'completed', 'none');

  -- Create payment transaction
  v_tip_id := gen_random_uuid();
  insert into public.payment_transactions (
    id, donation_id, creator_id, donor_name, amount, currency, message,
    provider, tran_id, status, expires_at
  )
  values (
    v_tip_id, v_donation_id, v_creator_id, p_tipper_name, p_amount, p_currency, p_tip_message,
    'aba_telegram', p_telegram_message_id, 'successful', p_telegram_sent_at + interval '5 minutes'
  );

  -- Create tip (trigger will copy media)
  insert into public.tips (
    creator_id, tipper_name, amount, currency, message,
    payment_method, payment_status, payment_transaction_id,
    photo_path, photo_status, voice_path, voice_duration_seconds
  )
  select
    v_creator_id, p_tipper_name, p_amount, p_currency, p_tip_message,
    'aba_telegram', 'successful', v_tip_id,
    null, 'none', null, null
  on conflict do nothing;

  return query select true, false, null, v_donation_id, v_tip_id;
end;
$function$;

revoke all on function public.streamkit_record_parsed_aba_tip(text, text, text, text, text, text, text, timestamptz, text, numeric, text, text) from public;
grant execute on function public.streamkit_record_parsed_aba_tip(text, text, text, text, text, text, text, timestamptz, text, numeric, text, text) to service_role;

-- streamkit_create_share_code (from 20261018000000_profiles_share_codes.sql)
-- ALIGNED WITH LIVE: uses ON CONFLICT (code) matching live unique constraint on profile_share_codes.code
create or replace function public.streamkit_create_share_code(
  p_sections text[]
) returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text;
  v_user_id uuid;
begin
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_code := upper(encode(gen_random_bytes(6), 'hex'));

  insert into public.profile_share_codes (user_id, code, sections, expires_at)
  values (v_user_id, v_code, p_sections, now() + interval '7 days')
  on conflict (code) do update set
    user_id = excluded.user_id,
    sections = excluded.sections,
    expires_at = excluded.expires_at,
    created_at = now();

  return query select v_code, now() + interval '7 days';
end;
$function$;

revoke all on function public.streamkit_create_share_code(text[]) from public;
grant execute on function public.streamkit_create_share_code(text[]) to authenticated;

-- streamkit_import_share_code (from 20261018000000_profiles_share_codes.sql)
create or replace function public.streamkit_import_share_code(
  p_code text,
  p_sections text[]
) returns table (imported boolean, message text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_share record;
  v_user_id uuid;
begin
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_share
  from public.profile_share_codes
  where code = upper(p_code);

  if not found then
    return query select false, 'Invalid or expired share code';
  end if;

  if v_share.expires_at < now() then
    return query select false, 'Share code has expired';
  end if;

  -- Import logic would go here (sections-based)
  -- This is a stub matching the migration

  return query select true, 'Settings imported successfully';
end;
$function$;

revoke all on function public.streamkit_import_share_code(text, text[]) from public;
grant execute on function public.streamkit_import_share_code(text, text[]) to authenticated;

-- ============================================================
-- GRANTS AND PERMISSIONS FOR NEW TABLES
-- ============================================================

-- tips table grants (already in schema but ensuring completeness)
grant select on table public.tips to authenticated, service_role;

-- donation_goals realtime (already in schema)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tips') then
    alter publication supabase_realtime add table public.tips;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donation_goals') then
    alter publication supabase_realtime add table public.donation_goals;
  end if;
exception when undefined_object then null;
end $$;