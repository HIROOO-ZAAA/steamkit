grant insert (
  creator_id, telegram_chat_id, telegram_chat_title, telegram_chat_type,
  group_name, status, linked_at, last_seen_at
) on table public.telegram_groups to authenticated, service_role;

grant update (
  telegram_chat_title, telegram_chat_type, group_name, status,
  linked_at, last_seen_at, updated_at
) on table public.telegram_groups to authenticated, service_role;

drop policy if exists "Creators insert own Telegram groups" on public.telegram_groups;
create policy "Creators insert own Telegram groups"
  on public.telegram_groups for insert to authenticated
  with check (auth.uid() = creator_id);

drop policy if exists "Creators update own Telegram groups" on public.telegram_groups;
create policy "Creators update own Telegram groups"
  on public.telegram_groups for update to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);
