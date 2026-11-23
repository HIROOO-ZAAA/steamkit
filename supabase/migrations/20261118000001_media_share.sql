-- Migration: 20261118000001_media_share.sql
-- Description: Media Share table with RLS and queue view for StreamKit overlay

-- Handle legacy table conflict: if media_share_queue exists as a table, drop it first
drop view if exists public.media_share_queue;

create table if not exists public.media_share (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  tipper_name text default 'Anonymous' not null,
  youtube_url text not null,
  youtube_video_id text not null,
  title text default 'YouTube Video' not null,
  thumbnail_url text,
  duration_seconds integer default 0 not null check (duration_seconds >= 0),
  status text default 'pending' not null check (status in ('pending', 'playing', 'played', 'skipped', 'cancelled')),
  tip_id uuid references public.tips(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  played_at timestamp with time zone,
  skipped_at timestamp with time zone
);

create index if not exists idx_media_share_creator_status on public.media_share (creator_id, status, created_at);
create index if not exists idx_media_share_created_at on public.media_share (created_at);

-- Enable Row Level Security
alter table public.media_share enable row level security;

-- Policies for media_share
drop policy if exists "Creators manage own media share" on public.media_share;
create policy "Creators manage own media share"
  on public.media_share
  for all
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Public view active media share" on public.media_share;
create policy "Public view active media share"
  on public.media_share
  for select
  to anon
  using (status in ('pending', 'playing'));

-- Grants
grant all on table public.media_share to service_role;
grant select, insert, update, delete on table public.media_share to authenticated;
grant select on table public.media_share to anon;

-- Updatable view for media_share_queue backward compatibility
create or replace view public.media_share_queue as
  select * from public.media_share;

grant all on public.media_share_queue to service_role, authenticated;
grant select on public.media_share_queue to anon;

-- Notify PostgREST
notify pgrst, 'reload schema';
