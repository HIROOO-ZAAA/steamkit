-- streamkit_audit_log RPC for recording admin actions
-- SECURITY DEFINER so service_role can write without direct table grants

create or replace function public.streamkit_audit_log(
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null
) returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.audit_log (actor_id, actor_role, action, resource_type, resource_id, before, after, ip_address, user_agent)
  values (p_actor_id, p_actor_role, p_action, p_resource_type, p_resource_id, p_before, p_after, p_ip_address, p_user_agent);
$function$;

revoke all on function public.streamkit_audit_log(uuid, text, text, text, text, jsonb, jsonb, inet, text) from public, anon, authenticated;
grant execute on function public.streamkit_audit_log(uuid, text, text, text, text, jsonb, jsonb, inet, text) to service_role;