-- Go-Live Announcements — Telegram group + Discord webhook notifications
-- Stores creator-configured endpoints for "I'm live" broadcasts

create table if not exists public.go_live_endpoints (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('telegram', 'discord')),
  endpoint_id uuid not null,
  -- For telegram: references telegram_groups.id
  -- For discord: the webhook URL (hashed for privacy)
  endpoint_hash text not null,
  is_active boolean default true,
  message_template text default '🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (creator_id, platform, endpoint_id)
);

alter table public.go_live_endpoints enable row level security;
revoke all on table public.go_live_endpoints from anon, authenticated;
grant select, insert, update, delete on table public.go_live_endpoints to authenticated, service_role;

drop policy if exists "Creators manage own go-live endpoints" on public.go_live_endpoints;
create policy "Creators manage own go-live endpoints"
  on public.go_live_endpoints for all to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create index if not exists go_live_endpoints_creator_idx on public.go_live_endpoints(creator_id);
create index if not exists go_live_endpoints_platform_idx on public.go_live_endpoints(platform);
create index if not exists go_live_endpoints_active_idx on public.go_live_endpoints(is_active);

create or replace function public.streamkit_set_go_live_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

drop trigger if exists go_live_endpoints_updated_at on public.go_live_endpoints;
create trigger go_live_endpoints_updated_at
  before update on public.go_live_endpoints
  for each row execute function public.streamkit_set_go_live_updated_at();

-- RPC to get active go-live endpoints for a creator
create or replace function public.streamkit_get_go_live_endpoints(p_creator_id uuid)
returns table (
  id uuid,
  platform text,
  endpoint_id uuid,
  endpoint_hash text,
  is_active boolean,
  message_template text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  select
    gle.id,
    gle.platform,
    gle.endpoint_id,
    gle.endpoint_hash,
    gle.is_active,
    gle.message_template,
    gle.created_at
  from public.go_live_endpoints gle
  where gle.creator_id = p_creator_id
    and gle.is_active = true
  order by gle.platform, gle.created_at;
$function$;

revoke all on function public.streamkit_get_go_live_endpoints(uuid) from public, anon;
grant execute on function public.streamkit_get_go_live_endpoints(uuid) to authenticated, service_role;

-- RPC to upsert a go-live endpoint
create or replace function public.streamkit_upsert_go_live_endpoint(
  p_platform text,
  p_endpoint_id uuid,
  p_endpoint_hash text,
  p_message_template text default '🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := auth.uid();
  v_endpoint_id uuid;
begin
  if v_creator_id is null then
    raise exception 'Authentication required';
  end if;
  if p_platform not in ('telegram', 'discord') then
    raise exception 'Invalid platform';
  end if;
  if p_endpoint_id is null then
    raise exception 'endpoint_id required';
  end if;
  if p_endpoint_hash is null or trim(p_endpoint_hash) = '' then
    raise exception 'endpoint_hash required';
  end if;

  insert into public.go_live_endpoints (
    creator_id, platform, endpoint_id, endpoint_hash, message_template
  ) values (
    v_creator_id, p_platform, p_endpoint_id, p_endpoint_hash, p_message_template
  )
  on conflict (creator_id, platform, endpoint_id) do update set
    endpoint_hash = excluded.endpoint_hash,
    message_template = excluded.message_template,
    is_active = true,
    updated_at = now()
  returning id into v_endpoint_id;

  return v_endpoint_id;
end
$function$;

revoke all on function public.streamkit_upsert_go_live_endpoint(text, uuid, text, text) from public, anon;
grant execute on function public.streamkit_upsert_go_live_endpoint(text, uuid, text, text) to authenticated;

-- RPC to deactivate a go-live endpoint
create or replace function public.streamkit_deactivate_go_live_endpoint(p_endpoint_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.go_live_endpoints
  set is_active = false
  where id = p_endpoint_id
    and creator_id = auth.uid();

  if not found then
    return false;
  end if;
  return true;
end
$function$;

revoke all on function public.streamkit_deactivate_go_live_endpoint(uuid) from public, anon;
grant execute on function public.streamkit_deactivate_go_live_endpoint(uuid) to authenticated;