-- StreamKit Master Database Schema & RLS Setup for Supabase
-- Paste this script into your Supabase Dashboard -> SQL Editor and run it.

-- 1. Profiles Table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  stream_title text default 'Live Stream Tipping & Alerts',
  role text default 'creator' check (role in ('creator', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.streamkit_overlay_credentials (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  token text unique not null default gen_random_uuid()::text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tip Settings Table
create table if not exists public.tip_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  min_tip_amount numeric(10, 2) default 1.00 not null,
  currency text default 'USD' not null,
  suggested_amounts numeric[] default '{2.00, 5.00, 10.00, 25.00}'::numeric[] not null,
  custom_thank_you text default 'Thank you for supporting the stream!',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Alert Settings Table
create table if not exists public.alert_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  duration_seconds integer default 6 not null,
  sound_url text default 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' not null,
  animation_type text default 'bounce' not null,
  font_color text default '#7c3aed' not null,
  tts_enabled boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Voice Settings (Khmer TTS) Table
create table if not exists public.voice_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  provider text default 'Khmer Natural (Browser)' not null,
  voice_id text default 'km-KH-Standard-A' not null,
  language text default 'km-KH' not null,
  pitch numeric(3, 2) default 1.0 not null,
  speed numeric(3, 2) default 1.0 not null,
  cloning_enabled boolean default false not null,
  cloning_consent boolean default false not null,
  cloned_voice_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Donation Goals Table
create table if not exists public.donation_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text default 'New Streaming PC' not null,
  target_amount numeric(10, 2) default 500.00 not null,
  current_amount numeric(10, 2) default 325.00 not null,
  bar_color text default '#7c3aed' not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Spin Wheels Table
create table if not exists public.spin_wheels (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  title text default 'Donation Wheel of Fortune' not null,
  min_tip_to_trigger numeric(10, 2) default 5.00 not null,
  slices jsonb default '[{"label": "100 Diamonds", "color": "#7c3aed"}, {"label": "VIP Role", "color": "#06b6d4"}, {"label": "Shoutout", "color": "#10b981"}, {"label": "Play Song", "color": "#f59e0b"}]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Raffles Table
create table if not exists public.raffles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text default 'Stream Giveaway Raffle' not null,
  status text default 'open' check (status in ('open', 'closed', 'completed')),
  winner_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Raffle Entries Table
create table if not exists public.raffle_entries (
  id uuid default gen_random_uuid() primary key,
  raffle_id uuid references public.raffles(id) on delete cascade not null,
  username text not null,
  display_name text,
  entries_count integer default 1 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Subathons Table
create table if not exists public.subathons (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  remaining_seconds integer default 14400 not null, -- 4 hours default
  minutes_per_dollar numeric(5, 2) default 1.00 not null,
  is_paused boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 10. Telegram Connections Table
create table if not exists public.telegram_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  bot_token text,
  chat_id text,
  is_enabled boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 11. Subscription Tiers Table
create table if not exists public.subscription_tiers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  price numeric(10, 2) not null,
  description text,
  badge_color text default '#7c3aed' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 12. Payment Transactions
create table if not exists public.payment_transactions (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  donor_name text default 'Anonymous' not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  message text,
  provider text not null check (provider in ('bakong', 'aba_payway')),
  provider_md5 text unique,
  provider_hash text unique,
  tran_id text unique,
  idempotency_key text unique,
  status text default 'pending' not null check (status in ('pending', 'processing', 'successful', 'completed', 'failed', 'expired', 'cancelled', 'refunded', 'review_required')),
  expires_at timestamp with time zone not null,
  provider_paid_at timestamp with time zone,
  verified_at timestamp with time zone,
  qr_string text,
  qr_image text,
  deeplink text,
  failure_reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 13. Tips Table
create table if not exists public.tips (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  tipper_name text default 'Anonymous' not null,
  amount numeric(10, 2) not null,
  currency text default 'USD' not null,
  message text,
  payment_method text default 'aba' not null,
  payment_status text default 'pending' not null,
  played_in_overlay boolean default false not null,
  payment_transaction_id uuid unique references public.payment_transactions(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 14. Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.streamkit_overlay_credentials enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.tip_settings enable row level security;
alter table public.alert_settings enable row level security;
alter table public.voice_settings enable row level security;
alter table public.donation_goals enable row level security;
alter table public.spin_wheels enable row level security;
alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.subathons enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.subscription_tiers enable row level security;
alter table public.tips enable row level security;

revoke all on table public.payment_transactions from anon, authenticated;
grant all on table public.payment_transactions to service_role;

create table if not exists public.payment_request_limits (
  fingerprint text primary key,
  window_started_at timestamp with time zone not null,
  hit_count integer not null check (hit_count > 0)
);
alter table public.payment_request_limits enable row level security;
revoke all on table public.payment_request_limits from anon, authenticated;
grant all on table public.payment_request_limits to service_role;
create or replace function public.streamkit_allow_payment_request(
  p_fingerprint text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hit_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit';
  end if;
  insert into public.payment_request_limits (fingerprint, window_started_at, hit_count)
  values (p_fingerprint, timezone('utc'::text, now()), 1)
  on conflict (fingerprint) do update
  set window_started_at = case
        when public.payment_request_limits.window_started_at <= timezone('utc'::text, now()) - make_interval(secs => p_window_seconds) then timezone('utc'::text, now())
        else public.payment_request_limits.window_started_at
      end,
      hit_count = case
        when public.payment_request_limits.window_started_at <= timezone('utc'::text, now()) - make_interval(secs => p_window_seconds) then 1
        else public.payment_request_limits.hit_count + 1
      end
  returning hit_count into v_hit_count;
  return v_hit_count <= p_limit;
end
$function$;
revoke all on function public.streamkit_allow_payment_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.streamkit_allow_payment_request(text, integer, integer) to service_role;

-- Policies Setup (Safe Idempotent Policy Creation)
drop policy if exists "Public profiles viewable by all" on public.profiles;
create policy "Public profiles viewable by all" on public.profiles for select using (true);
drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on table public.streamkit_overlay_credentials from anon, authenticated;
grant select, insert, update on table public.streamkit_overlay_credentials to authenticated;
drop policy if exists "Creators manage own overlay credential" on public.streamkit_overlay_credentials;
create policy "Creators manage own overlay credential"
  on public.streamkit_overlay_credentials
  for all to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Tip settings viewable by all" on public.tip_settings;
create policy "Tip settings viewable by all" on public.tip_settings for select using (true);
drop policy if exists "Users manage tip settings" on public.tip_settings;
create policy "Users manage tip settings" on public.tip_settings for all using (auth.uid() = user_id);

drop policy if exists "Alert settings viewable by all" on public.alert_settings;
create policy "Alert settings viewable by all" on public.alert_settings for select using (true);
drop policy if exists "Users manage alert settings" on public.alert_settings;
create policy "Users manage alert settings" on public.alert_settings for all using (auth.uid() = user_id);

drop policy if exists "Voice settings owner only" on public.voice_settings;
create policy "Voice settings owner only" on public.voice_settings for all using (auth.uid() = user_id);

drop policy if exists "Goals viewable by all" on public.donation_goals;
create policy "Goals viewable by all" on public.donation_goals for select using (true);
drop policy if exists "Users manage goals" on public.donation_goals;
create policy "Users manage goals" on public.donation_goals for all using (auth.uid() = user_id);

-- The Goals page writes goals straight from the browser client
-- (dashboard/goals/page.tsx: select, insert, update, delete). Those need table
-- privileges for the authenticated role, which are independent of the policies
-- above: RLS only narrows what an already-granted role may do, it never grants.
-- Without this the page failed every write with 42501 "permission denied for
-- table donation_goals". Reads appeared to work only because overlays read goals
-- through the SECURITY DEFINER function streamkit_get_goal_widget instead.
grant select, insert, update, delete on table public.donation_goals to authenticated;

drop policy if exists "Wheels viewable by all" on public.spin_wheels;
create policy "Wheels viewable by all" on public.spin_wheels for select using (true);
drop policy if exists "Users manage wheels" on public.spin_wheels;
create policy "Users manage wheels" on public.spin_wheels for all using (auth.uid() = user_id);

drop policy if exists "Raffles viewable by all" on public.raffles;
create policy "Raffles viewable by all" on public.raffles for select using (true);
drop policy if exists "Users manage raffles" on public.raffles;
create policy "Users manage raffles" on public.raffles for all using (auth.uid() = user_id);

drop policy if exists "Raffle entries viewable by all" on public.raffle_entries;
create policy "Raffle entries viewable by all" on public.raffle_entries for select using (true);
drop policy if exists "Anyone insert raffle entries" on public.raffle_entries;
create policy "Anyone insert raffle entries" on public.raffle_entries for insert with check (true);

drop policy if exists "Subathons viewable by all" on public.subathons;
create policy "Subathons viewable by all" on public.subathons for select using (true);
drop policy if exists "Users manage subathons" on public.subathons;
create policy "Users manage subathons" on public.subathons for all using (auth.uid() = user_id);

drop policy if exists "Telegram connections owner only" on public.telegram_connections;
create policy "Telegram connections owner only" on public.telegram_connections for all using (auth.uid() = user_id);

drop policy if exists "Tiers viewable by all" on public.subscription_tiers;
create policy "Tiers viewable by all" on public.subscription_tiers for select using (true);
drop policy if exists "Users manage tiers" on public.subscription_tiers;
create policy "Users manage tiers" on public.subscription_tiers for all using (auth.uid() = user_id);

drop policy if exists "Tips viewable by all" on public.tips;
drop policy if exists "Creators view own tips" on public.tips;
create policy "Creators view own tips"
  on public.tips for select to authenticated
  using (auth.uid() = creator_id);
drop policy if exists "Anyone insert tips" on public.tips;

create or replace function public.streamkit_complete_bakong_payment(
  p_payment_id uuid,
  p_provider_hash text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_verified_account_id text,
  p_expected_account_id text,
  p_provider_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_tip_id uuid;
begin
  select * into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.status = 'successful' then
    select id into v_tip_id from public.tips where payment_transaction_id = v_payment.id;
    return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id);
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment intent is not pending';
  end if;

  if v_payment.expires_at <= timezone('utc'::text, now())
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at
    or p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
    or lower(p_verified_account_id) <> lower(p_expected_account_id)
  then
    raise exception 'Provider transaction does not match payment intent';
  end if;

  update public.payment_transactions
  set status = 'successful',
      provider_hash = p_provider_hash,
      provider_paid_at = p_provider_paid_at,
      verified_at = timezone('utc'::text, now())
  where id = v_payment.id;

  insert into public.tips (
    creator_id, tipper_name, amount, currency, message, payment_method,
    payment_status, payment_transaction_id
  ) values (
    v_payment.creator_id, v_payment.donor_name, v_payment.amount,
    v_payment.currency, v_payment.message, 'bakong', 'successful', v_payment.id
  ) returning id into v_tip_id;

  return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id);
end
$function$;

revoke all on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) to service_role;

create or replace function public.streamkit_resolve_overlay(p_token text)
returns table (
  creator_id uuid,
  duration_seconds integer,
  sound_url text,
  animation_type text,
  font_color text,
  tts_enabled boolean,
  language text,
  pitch numeric,
  speed numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    credentials.creator_id,
    coalesce(alerts.duration_seconds, 6),
    coalesce(alerts.sound_url, 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'),
    coalesce(alerts.animation_type, 'bounce'),
    coalesce(alerts.font_color, '#10b981'),
    coalesce(alerts.tts_enabled, true),
    coalesce(voices.language, 'km-KH'),
    coalesce(voices.pitch, 1.0),
    coalesce(voices.speed, 1.0)
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts on alerts.user_id = credentials.creator_id
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated, service_role;

-- Enable Supabase Realtime for tips and goals
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


-- tips is read and written by server routes through createAdminClient(),
-- which runs as service_role. That role does not inherit from anon or
-- authenticated, so a grant to authenticated alone leaves it locked out:
-- PostgREST answers 42501 and the route fails with "permission denied for
-- table tips". RLS is separate -- it narrows what a granted role may do,
-- it never grants table access.
-- authenticated READS tips (alert history, dashboard, the overlay log). Writes
-- go through SECURITY DEFINER RPCs or the service role, so authenticated is
-- deliberately not granted INSERT/UPDATE/DELETE here.
grant select on table public.tips to authenticated, service_role;

-- The public creator page may show a small supporter list, but it must not
-- expose private tip messages, payment state, or unrelated creator records.
create or replace function public.streamkit_get_public_creator_supporters(
  p_username text,
  p_limit integer default 10
)
returns table (
  id uuid,
  tipper_name text,
  amount numeric,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id,
    coalesce(nullif(pg_catalog.btrim(t.tipper_name), ''), 'Supporter'),
    t.amount,
    t.currency
  from public.tips as t
  join public.profiles as p on p.id = t.creator_id
  where pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(p_username))
    and t.payment_status = 'successful'
  order by t.amount desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 10);
$function$;

revoke all on function public.streamkit_get_public_creator_supporters(text, integer) from public;
grant execute on function public.streamkit_get_public_creator_supporters(text, integer) to anon, authenticated;

-- The spin-wheel overlay needs only a token-scoped event signal, not alert
-- messages or attached media. Polling this RPC avoids exposing tips through
-- anonymous Realtime subscriptions.
create or replace function public.streamkit_recent_spin_tips(
  p_token text,
  p_since timestamptz
)
returns table (
  id uuid,
  tipper_name text,
  payment_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
begin
  select credentials.creator_id into v_creator
  from public.streamkit_overlay_credentials as credentials
  where credentials.token = p_token;

  if v_creator is null then
    return;
  end if;

  return query
  select t.id, t.tipper_name, t.payment_status, t.created_at
  from public.tips as t
  where t.creator_id = v_creator
    and t.payment_status in ('successful', 'test')
    and t.created_at > p_since
  order by t.created_at asc
  limit 100;
end
$function$;

revoke all on function public.streamkit_recent_spin_tips(text, timestamptz) from public;
grant execute on function public.streamkit_recent_spin_tips(text, timestamptz) to anon, authenticated;


-- tip_settings is read and written by server routes through createAdminClient(),
-- which runs as service_role. That role does not inherit from anon or
-- authenticated, so a grant to authenticated alone leaves it locked out:
-- PostgREST answers 42501 and the route fails with "permission denied for
-- table tip_settings". RLS is separate -- it narrows what a granted role may do,
-- it never grants table access.
-- anon reads this to build the public donation form on /pay/[username].
-- Safe to expose: min amount, currency, suggested amounts, thank-you text.
-- No credentials, no provider references.
grant select on table public.tip_settings to anon, authenticated, service_role;
grant insert, update on table public.tip_settings to authenticated, service_role;


-- profiles is read by three different clients, so it needs three different
-- grants. RLS is separate throughout -- it narrows what a granted role may do,
-- it never grants table access -- and the existing policies already say what
-- each role may see: "Public profiles viewable by all" and "Users manage own
-- profile".
--
--   anon         SELECT. The public creator page (/[username]),
--                /pay/[username] and its opengraph image are read by signed-out
--                visitors, so without this every public page is a 42501. Safe
--                because the table holds only public-facing fields: id,
--                username, display_name, avatar_url, banner_url, bio,
--                stream_title, role, created_at. No email, no tokens, no keys.
--   authenticated SELECT plus column-scoped INSERT/UPDATE on user-editable
--                fields only. role and created_at are never column grants.
--   service_role  full DML, because app/api/payments/khqr reaches this table
--                through createAdminClient() and that role inherits nothing.
grant select on table public.profiles to anon, authenticated, service_role;
grant insert, update on table public.profiles to service_role;

-- Prevent role escalation: authenticated users must not be able to promote
-- themselves to admin by writing profiles.role directly.
--
-- A table-level INSERT/UPDATE grant covers every column, so it MUST be revoked
-- before column grants are issued. A REVOKE of just (role) cannot narrow a
-- table-level grant.
revoke insert, update on table public.profiles
  from public, anon, authenticated;
revoke insert (role, created_at) on table public.profiles
  from public, anon, authenticated;
revoke update (role, created_at) on table public.profiles
  from public, anon, authenticated;

-- Safe columns only. role keeps DEFAULT 'creator'; created_at keeps now().
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

-- Defense in depth: catches a future accidental table-level or column-level
-- grant on role. It does not depend on auth.uid() or JWT role claims.
create or replace function public.streamkit_guard_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_effective_role text := coalesce(current_setting('role', true), 'none');
  v_trusted boolean;
begin
  -- Trusted: PostgREST service_role, a direct service_role/postgres session,
  -- or the SQL Editor's postgres session (role = none, or an admin-to-admin
  -- role switch). A normal authenticated PostgREST session is not trusted,
  -- and neither is a postgres session that merely did SET ROLE authenticated.
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


-- service_role needs full DML on tips because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.tips to service_role;


-- service_role needs full DML on tip_settings because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.tip_settings to service_role;


-- service_role needs full DML on profiles because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.profiles to service_role;


-- profiles: SELECT only here. INSERT/UPDATE are column-scoped above and must
-- never be re-granted at table level in this file.
grant select on table public.profiles to anon, authenticated, service_role;


-- tip_settings: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.tip_settings to anon, authenticated, service_role;
grant select, insert, update on table public.tip_settings to authenticated, service_role.


-- tips: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.tips to authenticated, service_role;


-- ============================================================
-- ADDITIONAL TABLES (from applied migrations, not in original schema)
-- ============================================================

-- Donations table (from 20261001130000_payments_aba_payway.sql)
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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.donations enable row level security;
revoke all on table public.donations from anon, authenticated;
grant select on table public.donations to authenticated, service_role;
grant insert, update, delete on table public.donations to service_role;

drop policy if exists "Creators view own donations" on public.donations;
create policy "Creators view own donations"
  on public.donations for select to authenticated
  using (auth.uid() = creator_id);

-- Payment webhooks table (from 20261001130000_payments_aba_payway.sql)
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

-- Telegram devices (from 20261001160000_telegram_device_linking.sql)
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

-- Telegram device events (from 20261001160000_telegram_device_linking.sql)
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

-- Telegram groups (from 20261001180000_telegram_group_linking.sql)
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

-- Telegram group events (from 20261001180000_telegram_group_linking.sql)
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

-- Telegram local agents (from 20261001200000_telegram_local_listener.sql)
create table if not exists public.telegram_local_agents (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  agent_token_hash text not null unique,
  telegram_chat_id text not null,
  payway_bot_username text not null,
  sender_user_id text,
  created_at timestamptz default now()
);

alter table public.telegram_local_agents enable row level security;
revoke all on table public.telegram_local_agents from anon, authenticated;
grant all on table public.telegram_local_agents to authenticated, service_role;

drop policy if exists "Creators manage own local agents" on public.telegram_local_agents;
create policy "Creators manage own local agents"
  on public.telegram_local_agents for all to authenticated
  using (auth.uid() = creator_id);

-- Telegram ABA notifications (from 20261001200000_telegram_local_listener.sql)
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

-- Voice clones (from 20261017000000_voice_clones_table.sql + 20261017000002_voice_clones_owner_id.sql)
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

-- Login sessions (from 20261017000001_auth_login_sessions.sql)
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

-- Profile share codes (from 20261018000000_profiles_share_codes.sql)
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

-- Payment merchant credentials (from 20261019000001_payments_merchant_credentials.sql)
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

-- Alert tiers (from 20261019000007_alerts_tiers.sql)
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

-- Alert voice intro (from 20261019000007_alerts_tiers.sql)
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

-- Spin wheel spins (from 20261015000002_draws_server_authoritative.sql)
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

-- Alert overlay claims (from 20261021000001_alert_overlay_claims.sql)
create table if not exists public.alert_overlay_claims (
  tip_id uuid primary key references public.tips(id) on delete cascade,
  overlay_token text not null,
  claimed_at timestamptz default now()
);

alter table public.alert_overlay_claims enable row level security;
revoke all on table public.alert_overlay_claims from anon, authenticated;
grant all on table public.alert_overlay_claims to service_role;

-- Goal manual adjustments (from 20261110000000_goal_manual_adjustments.sql)
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
-- ADDITIONAL RPCs (from applied migrations)
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
    return;
  end if;

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

  select id into v_tip_id
  from public.tips
  where payment_method = 'aba_telegram'
    and payment_transaction_id = p_telegram_message_id;

  if found then
    return query select true, true, 'duplicate', null, v_tip_id;
  end if;

  v_donation_id := gen_random_uuid();
  insert into public.donations (id, creator_id, donor_name, message, amount, currency, status, photo_status)
  values (v_donation_id, v_creator_id, p_tipper_name, p_tip_message, p_amount, p_currency, 'completed', 'none');

  v_tip_id := gen_random_uuid();
  insert into public.payment_transactions (
    id, donation_id, creator_id, donor_name, amount, currency, message,
    provider, tran_id, status, expires_at
  )
  values (
    v_tip_id, v_donation_id, v_creator_id, p_tipper_name, p_amount, p_currency, p_tip_message,
    'aba_telegram', p_telegram_message_id, 'successful', p_telegram_sent_at + interval '5 minutes'
  );

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

  return query select true, 'Settings imported successfully';
end;
$function$;

revoke all on function public.streamkit_import_share_code(text, text[]) from public;
grant execute on function public.streamkit_import_share_code(text, text[]) to authenticated;
