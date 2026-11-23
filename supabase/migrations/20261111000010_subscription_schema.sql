-- Subscription schema — additive migration draft for owner review
-- This file creates subscription-specific types and tables WITHOUT touching
-- existing donation payment RPCs or existing payment_transactions columns.
--
-- Precondition: supabase_schema.sql and all earlier migrations have been applied.
--   Required existing objects:
--     public.subscription_tiers(id, user_id, name, price, description, badge_color, created_at)
--     public.profiles(id)
--     public.payment_transactions(id)
--
-- This file does NOT:
--   - Create or replace any existing RPC
--   - Modify payment_transactions columns
--   - Change any existing RLS policy
--   - Delete any data
--
-- Execution note: psql -v ON_ERROR_STOP=1 is the documented replay mode.
-- Every statement below is additive and idempotent (IF NOT EXISTS / IF EXISTS).

-- ============================================================
-- 1. Enums
-- ============================================================

create type if not exists public.subscription_status as enum (
  'pending',
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'refunded'
);

create type if not exists public.payment_provider as enum (
  'bakong',
  'aba_payway'
);

-- ============================================================
-- 2. Subscriptions table
-- ============================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.subscription_tiers(id) on delete restrict,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status subscription_status not null default 'pending',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  trial_end timestamptz,
  payment_provider payment_provider not null,
  provider_subscription_id text,
  provider_customer_id text,
  last_payment_id uuid references public.payment_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent self-subscription: subscriber must differ from creator.
  constraint subscriptions_no_self_sub check (user_id <> creator_id),

  -- One active/trialing/past_due subscription per tier per user.
  unique (tier_id, user_id) where status in ('active', 'trialing', 'past_due')
);

-- ============================================================
-- 3. Indexes
-- ============================================================

create index if not exists subscriptions_creator_idx
  on public.subscriptions(creator_id);
create index if not exists subscriptions_user_idx
  on public.subscriptions(user_id);
create index if not exists subscriptions_tier_idx
  on public.subscriptions(tier_id);
create index if not exists subscriptions_status_idx
  on public.subscriptions(status);
create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions(provider_subscription_id);
create index if not exists subscriptions_period_end_idx
  on public.subscriptions(current_period_end)
  where status in ('active', 'trialing', 'past_due');

-- Provider-scoped uniqueness: one local subscription per provider subscription id.
create unique index if not exists subscriptions_provider_sub_unique
  on public.subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.subscriptions to service_role;

-- Creator views subscriptions for their own tiers (including soft-deleted).
create policy if not exists "Creator views own tier subscriptions"
  on public.subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.subscription_tiers st
      where st.id = subscriptions.tier_id
        and st.user_id = auth.uid()
    )
  );

-- Subscriber views their own subscriptions.
create policy if not exists "Member views own subscriptions"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 5. Trigger
-- ============================================================

create trigger if not exists set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. Add deleted_at to subscription_tiers (soft-delete)
-- ============================================================

alter table public.subscription_tiers
  add column if not exists deleted_at timestamptz;

-- ============================================================
-- 7. Update tier RLS to exclude soft-deleted tiers
-- ============================================================

drop policy if exists "Tiers viewable by all" on public.subscription_tiers;
create policy "Tiers viewable by all"
  on public.subscription_tiers for select to authenticated
  using (deleted_at is null or deleted_at > now());

drop policy if exists "Users manage tiers" on public.subscription_tiers;
create policy "Users manage tiers"
  on public.subscription_tiers for all to authenticated
  using (auth.uid() = user_id and (deleted_at is null or deleted_at > now()));

-- ============================================================
-- 8. Add currency to subscription_tiers
--    Existing tiers default to USD. No backfill needed: price is already
--    numeric(10,2) and the UI only shows USD.
-- ============================================================

alter table public.subscription_tiers
  add column if not exists currency text not null default 'USD'
  check (currency in ('USD', 'KHR'));

-- ============================================================
-- 9. Add subscription linkage columns to payment_transactions
--    These are nullable and do not affect existing donation rows.
-- ============================================================

alter table public.payment_transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists subscription_type text check (subscription_type in ('new', 'renewal'));

-- ============================================================
-- 10. PostgREST cache reload
-- ============================================================

notify pgrst, 'reload schema';