-- Subscription membership table and lifecycle for StreamKit
-- Creates subscriptions table with full lifecycle states, RLS, and payment integration

-- Enum for subscription status
create type subscription_status as enum (
  'pending',
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'refunded'
);

-- Enum for payment provider
create type payment_provider as enum (
  'bakong',
  'aba_payway'
);

-- Subscriptions table
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
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Ensure one active/trialing/past_due subscription per tier per user
  unique (tier_id, user_id) where status in ('active', 'trialing', 'past_due')
);

create index subscriptions_creator_idx on public.subscriptions(creator_id);
create index subscriptions_user_idx on public.subscriptions(user_id);
create index subscriptions_tier_idx on public.subscriptions(tier_id);
create index subscriptions_status_idx on public.subscriptions(status);
create index subscriptions_provider_sub_idx on public.subscriptions(provider_subscription_id);
create index subscriptions_period_end_idx on public.subscriptions(current_period_end) where status in ('active', 'trialing', 'past_due');

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.subscriptions to service_role;

-- RLS: Creator views subscriptions for their tiers
create policy "Creator views own tier subscriptions"
  on public.subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.subscription_tiers st
      where st.id = subscriptions.tier_id
      and st.user_id = auth.uid()
      and (st.deleted_at is null or st.deleted_at > now())
    )
  );

-- RLS: Member views own subscriptions
create policy "Member views own subscriptions"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid());

-- RLS: Service role full access (for payment completion RPCs)
-- Already granted via GRANT above

-- Updated timestamp trigger
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Add deleted_at to subscription_tiers for soft-delete (replaces hard delete)
alter table public.subscription_tiers
  add column if not exists deleted_at timestamptz;

-- Update existing tier RLS policies to exclude deleted tiers
-- (Assumes existing policies check tier existence)

-- Extend payment_transactions metadata for subscription linkage
-- Add columns if they don't exist
alter table public.payment_transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

alter table public.payment_transactions
  add column if not exists subscription_type text check (subscription_type in ('new', 'renewal'));