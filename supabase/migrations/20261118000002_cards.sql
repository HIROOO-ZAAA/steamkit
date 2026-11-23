-- Card System — random pulls, battles, S3 art
-- Depends on: profiles, tips, subscription_tiers

-- Cards table: creator's card pool
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  image_url text not null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Card pulls table: tracks which card a donation pulled
create table if not exists public.card_pulls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  donation_id uuid references public.tips(id) on delete set null,
  card_id uuid not null references public.cards(id) on delete restrict,
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_cards_user on public.cards(user_id);
create index if not exists idx_card_pulls_user on public.card_pulls(user_id);
create index if not exists idx_card_pulls_donation on public.card_pulls(donation_id);
create index if not exists idx_card_pulls_created on public.card_pulls(created_at desc);

-- Updated trigger
drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at before update on public.cards for each row execute function public.set_updated_at();

-- RLS — Cards
alter table public.cards enable row level security;
revoke all on table public.cards from anon, authenticated;
grant select, insert, update, delete on table public.cards to service_role;
grant select on table public.cards to authenticated, anon;

drop policy if exists "Creator manages own cards" on public.cards;
create policy "Creator manages own cards" on public.cards for all to authenticated using (
  auth.uid() = user_id
);

drop policy if exists "Anyone views card for overlay" on public.cards;
create policy "Anyone views card for overlay" on public.cards for select to authenticated, anon using (true);

-- RLS — Card Pulls
alter table public.card_pulls enable row level security;
revoke all on table public.card_pulls from anon, authenticated;
grant select, insert on table public.card_pulls to service_role;

drop policy if exists "Creator views own pulls" on public.card_pulls;
create policy "Creator views own pulls" on public.card_pulls for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = card_pulls.user_id and p.id = auth.uid())
);

drop policy if exists "Subscriber views own pulls" on public.card_pulls;
create policy "Subscriber views own pulls" on public.card_pulls for select to authenticated using (
  exists (select 1 from public.tips t where t.id = card_pulls.donation_id and t.creator_id = auth.uid())
);

-- Notify PostgREST
notify pgrst, 'reload schema';