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

-- 12. Payment Intents
create table if not exists public.payment_transactions (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  donor_name text default 'Anonymous' not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  message text,
  provider text not null check (provider = 'bakong'),
  provider_md5 text unique not null,
  provider_hash text unique,
  status text default 'pending' not null check (status in ('pending', 'successful', 'failed', 'expired', 'review_required')),
  expires_at timestamp with time zone not null,
  provider_paid_at timestamp with time zone,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
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
create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id);

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
create policy "Tips viewable by all" on public.tips for select using (true);
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
--   authenticated SELECT + INSERT + UPDATE. The settings page and the browser
--                source page upsert the creator's own row; RLS restricts those
--                writes to auth.uid() = id.
--   service_role  full DML, because app/api/payments/khqr reaches this table
--                through createAdminClient() and that role inherits nothing.
grant select on table public.profiles to anon, authenticated, service_role;
grant insert, update on table public.profiles to authenticated, service_role;


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


-- profiles: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.profiles to anon, authenticated, service_role;
grant select, insert, update on table public.profiles to authenticated, service_role;


-- tip_settings: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.tip_settings to anon, authenticated, service_role;
grant select, insert, update on table public.tip_settings to authenticated, service_role;


-- tips: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.tips to authenticated, service_role;
