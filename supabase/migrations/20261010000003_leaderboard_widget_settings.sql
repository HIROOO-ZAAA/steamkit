alter table public.streamkit_overlay_credentials
  add column if not exists leaderboard_widget jsonb default '{}'::jsonb not null;

create or replace function public.streamkit_get_leaderboard_settings(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
begin
  select credentials.leaderboard_widget into v_settings
  from public.streamkit_overlay_credentials as credentials
  where credentials.token = p_token;
  return coalesce(v_settings, '{}'::jsonb);
end
$function$;

revoke all on function public.streamkit_get_leaderboard_settings(text) from public;
grant execute on function public.streamkit_get_leaderboard_settings(text) to anon, authenticated;
