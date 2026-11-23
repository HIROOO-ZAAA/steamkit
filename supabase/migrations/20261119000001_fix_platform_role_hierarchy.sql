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
