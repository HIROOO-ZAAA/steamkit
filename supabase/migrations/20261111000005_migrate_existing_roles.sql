-- Migrate existing profiles.role values to platform_roles table
-- Maps legacy single-column role to the new 6-role platform hierarchy

-- First, ensure any existing 'admin' in profiles gets super_admin in platform_roles
-- This is a one-time data migration; subsequent role changes go through platform_roles

insert into public.platform_roles (user_id, role, granted_by, granted_at)
select
  p.id,
  case
    when p.role = 'admin' then 'super_admin'::platform_role
    when p.role = 'moderator' then 'platform_admin'::platform_role
    when p.role = 'billing' then 'billing_admin'::platform_role
    when p.role = 'support' then 'support_admin'::platform_role
    when p.role = 'creator' then 'creator_admin'::platform_role
    else 'viewer'::platform_role
  end as role,
  null as granted_by,
  now() as granted_at
from public.profiles p
where p.role is not null
  and p.role <> 'viewer'
on conflict (user_id, role) do nothing;

-- Verify migration: show users who received platform roles
select
  p.id,
  p.username,
  p.role as legacy_role,
  pr.role as platform_role
from public.profiles p
left join public.platform_roles pr on pr.user_id = p.id
where p.role is not null
  and p.role <> 'viewer'
order by p.id;