alter table public.telegram_groups
  add column if not exists group_id text,
  add column if not exists group_title text,
  add column if not exists is_active boolean default true,
  add column if not exists session_data text;

create unique index if not exists unique_creator_group
  on public.telegram_groups (creator_id, group_id)
  where group_id is not null;

drop policy if exists "Creators manage own Telegram groups" on public.telegram_groups;
create policy "Creators manage own Telegram groups"
  on public.telegram_groups
  for all
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

grant select, insert, update, delete on table public.telegram_groups to authenticated, service_role;
