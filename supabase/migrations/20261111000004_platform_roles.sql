-- Platform roles table and 6-role enum for StreamKit platform governance
-- super_admin > platform_admin > billing_admin > support_admin > creator_admin > viewer

create type platform_role as enum (
  'super_admin',
  'platform_admin',
  'billing_admin',
  'support_admin',
  'creator_admin',
  'viewer'
);

create table if not exists public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role platform_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz default now(),
  expires_at timestamptz,
  unique (user_id, role)
);

create index platform_roles_user_idx on public.platform_roles(user_id);
create index platform_roles_role_idx on public.platform_roles(role);

alter table public.platform_roles enable row level security;

-- Only super_admin and platform_admin can manage roles
create policy "Platform roles readable by admins"
  on public.platform_roles for select
  using (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role in ('super_admin', 'platform_admin')
      and (pr.expires_at is null or pr.expires_at > now())
    )
  );

create policy "Platform roles manageable by super_admin"
  on public.platform_roles for all
  using (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role = 'super_admin'
      and (pr.expires_at is null or pr.expires_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role = 'super_admin'
      and (pr.expires_at is null or pr.expires_at > now())
    )
  );

revoke all on table public.platform_roles from anon, authenticated;
grant select, insert, update, delete on table public.platform_roles to service_role;

create or replace function public.streamkit_platform_role_rank(p_role platform_role)
returns smallint
language sql
immutable
set search_path = ''
as $function$
  select case p_role
    when 'super_admin'::platform_role then 6
    when 'platform_admin'::platform_role then 5
    when 'billing_admin'::platform_role then 4
    when 'support_admin'::platform_role then 3
    when 'creator_admin'::platform_role then 2
    when 'viewer'::platform_role then 1
    else 0
  end::smallint;
$function$;

revoke all on function public.streamkit_platform_role_rank(platform_role) from public, anon, authenticated;
grant execute on function public.streamkit_platform_role_rank(platform_role) to service_role;

create or replace function public.streamkit_has_platform_role(
  p_user_id uuid,
  p_min_role platform_role
) returns boolean
language sql
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.platform_roles pr
    where pr.user_id = p_user_id
    and public.streamkit_platform_role_rank(pr.role) >= public.streamkit_platform_role_rank(p_min_role)
    and (pr.expires_at is null or pr.expires_at > now())
  );
$function$;

revoke all on function public.streamkit_has_platform_role(uuid, platform_role) from public, anon, authenticated;
grant execute on function public.streamkit_has_platform_role(uuid, platform_role) to service_role;

create or replace function public.streamkit_get_platform_role(p_user_id uuid)
returns platform_role
language sql
security definer
set search_path = ''
as $function$
  select coalesce(
    (select pr.role from public.platform_roles pr
     where pr.user_id = p_user_id
     and (pr.expires_at is null or pr.expires_at > now())
     order by public.streamkit_platform_role_rank(pr.role) desc
     limit 1),
    'viewer'::platform_role
  );
$function$;

revoke all on function public.streamkit_get_platform_role(uuid) from public, anon, authenticated;
grant execute on function public.streamkit_get_platform_role(uuid) to service_role;