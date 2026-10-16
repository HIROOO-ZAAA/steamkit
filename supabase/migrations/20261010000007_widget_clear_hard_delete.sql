-- "Clear widget history" now hard-deletes the creator's donation rows
drop function if exists public.streamkit_widget_clear_history();

create or replace function public.streamkit_widget_clear_history()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.tips
  where creator_id = v_user;

  update public.streamkit_overlay_credentials
  set widget_cleared_at = now()
  where creator_id = v_user;
end
$function$;

revoke all on function public.streamkit_widget_clear_history() from public;
grant execute on function public.streamkit_widget_clear_history() to authenticated;
