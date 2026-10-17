-- "Clear widget history" stamps widget_cleared_at. It does NOT delete rows.
--
-- The filename says "hard_delete" and the body used to. This file's entire
-- purpose was to replace streamkit_widget_clear_history() with a version that
-- runs
--
--   delete from public.tips where creator_id = auth.uid()
--
-- inside a SECURITY DEFINER function granted to `authenticated`. Any signed-in
-- user could permanently erase every tip on their creator account -- including
-- completed, verified payments -- by calling one RPC.
--
-- That was reversed the next day by 20261010000008, which recreated the
-- function as a timestamp-only UPDATE. So the destructive version was brief on
-- production. Replaying the migrations in filename order, though, made it live
-- again for the whole window between this file and that one, and it was the
-- last definition in the set to carry the delete.
--
-- The body below is the final, safe form. Nothing else in this file is unique:
-- its function was byte-identical to the one in
-- 20261010000005_widget_overlay_session_clear.sql, which now also carries the
-- safe body, and 20261010000008 recreates it a third time.
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

  update public.streamkit_overlay_credentials
  set widget_cleared_at = now()
  where creator_id = v_user;
end
$function$;

revoke all on function public.streamkit_widget_clear_history() from public;
grant execute on function public.streamkit_widget_clear_history() to authenticated;