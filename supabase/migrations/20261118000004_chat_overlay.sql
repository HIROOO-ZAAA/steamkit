-- Migration: 20261118000004_chat_overlay.sql
-- Description: Chat overlay and stream champion tables with RLS

-- 1. Chat Messages Table
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  message_id text,
  author_name text default 'Anonymous' not null,
  author_avatar_url text,
  author_channel_id text,
  message text not null,
  username text generated always as (author_name) stored,
  text text generated always as (message) stored,
  platform text default 'youtube' not null check (platform in ('youtube', 'twitch', 'kick', 'system')),
  is_super_chat boolean default false not null,
  super_chat_amount numeric(10, 2) check (super_chat_amount is null or super_chat_amount >= 0),
  super_chat_currency text,
  is_moderator boolean default false not null,
  is_sponsor boolean default false not null,
  published_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_chat_messages_creator_pub on public.chat_messages (creator_id, published_at desc);
create index if not exists idx_chat_messages_msg_id on public.chat_messages (creator_id, message_id);

-- Enable RLS for chat_messages
alter table public.chat_messages enable row level security;

drop policy if exists "Creators manage own chat messages" on public.chat_messages;
create policy "Creators manage own chat messages"
  on public.chat_messages
  for all
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Public view creator chat messages" on public.chat_messages;
create policy "Public view creator chat messages"
  on public.chat_messages
  for select
  to anon
  using (true);

grant all on table public.chat_messages to service_role;
grant select, insert, update, delete on table public.chat_messages to authenticated;
grant select on table public.chat_messages to anon;

-- 2. Champion Table
create table if not exists public.champion (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade unique not null,
  donor_name text default 'Anonymous' not null,
  avatar_url text,
  total_amount numeric(10, 2) default 0.00 not null check (total_amount >= 0),
  currency text default 'USD' not null,
  message text,
  title text default 'Stream Champion' not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_champion_creator on public.champion (creator_id);

-- Enable RLS for champion
alter table public.champion enable row level security;

drop policy if exists "Creators manage own champion" on public.champion;
create policy "Creators manage own champion"
  on public.champion
  for all
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Public view champion" on public.champion;
create policy "Public view champion"
  on public.champion
  for select
  to anon
  using (true);

grant all on table public.champion to service_role;
grant select, insert, update, delete on table public.champion to authenticated;
grant select on table public.champion to anon;

-- 3. Streams Table (Multi-Stream)
create table if not exists public.streams (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  username text not null,
  youtube_channel_id text not null,
  youtube_video_id text,
  live_status text default 'none' not null check (live_status in ('none', 'live', 'upcoming')),
  viewer_count integer default 0 not null check (viewer_count >= 0),
  thumbnail_url text default '' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_streams_creator on public.streams (creator_id, created_at desc);

-- Enable RLS for streams
alter table public.streams enable row level security;

drop policy if exists "Creators manage own streams" on public.streams;
create policy "Creators manage own streams"
  on public.streams
  for all
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Public view streams" on public.streams;
create policy "Public view streams"
  on public.streams
  for select
  to anon
  using (true);

grant all on table public.streams to service_role;
grant select, insert, update, delete on table public.streams to authenticated;
grant select on table public.streams to anon;

