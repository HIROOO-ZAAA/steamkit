-- Per-widget history clear: each widget keeps its own cleared timestamp instead of
-- deleting the shared tips rows, so clearing one widget does not wipe the others.

alter table public.streamkit_overlay_credentials
  add column if not exists leaderboard_cleared_at timestamptz,
  add column if not exists goals_cleared_at timestamptz;

-- 1. LEADERBOARD: sets only leaderboard_cleared_at
create or replace function public.streamkit_leaderboard_clear_history()
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
  set leaderboard_cleared_at = now()
  where creator_id = v_user;
end
$function$;

revoke all on function public.streamkit_leaderboard_clear_history() from public;
grant execute on function public.streamkit_leaderboard_clear_history() to authenticated;

-- 2. GOALS: sets only goals_cleared_at
create or replace function public.streamkit_goals_clear_history()
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
  set goals_cleared_at = now()
  where creator_id = v_user;
end
$function$;

revoke all on function public.streamkit_goals_clear_history() from public;
grant execute on function public.streamkit_goals_clear_history() to authenticated;

-- 3. WIDGET OVERLAY clear now also only sets its own timestamp
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

-- Goal widget: sum only tips after goals_cleared_at
drop function if exists public.streamkit_get_goal_widget(text);
create or replace function public.streamkit_get_goal_widget(p_token text)
returns table (
  title text,
  target_amount numeric,
  current_amount numeric,
  bar_color text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
  v_cleared timestamptz;
begin
  select credentials.creator_id, credentials.goals_cleared_at
    into v_creator, v_cleared
  from public.streamkit_overlay_credentials as credentials
  where credentials.token = p_token;

  if v_creator is null then
    return;
  end if;

  return query
  select
    goals.title,
    goals.target_amount,
    coalesce((
      select sum(t.amount)
      from public.tips as t
      where t.creator_id = v_creator
        and t.payment_status in ('successful', 'test')
        and t.currency = 'USD'
        and t.created_at > coalesce(v_cleared, '-infinity'::timestamptz)
    ), 0)::numeric as current_amount,
    goals.bar_color
  from public.donation_goals as goals
  where goals.user_id = v_creator
    and goals.is_active = true
  order by goals.created_at desc
  limit 1;
end
$function$;

revoke all on function public.streamkit_get_goal_widget(text) from public;
grant execute on function public.streamkit_get_goal_widget(text) to anon, authenticated;

-- Dashboard leaderboard list: hide tips before leaderboard_cleared_at
drop function if exists public.streamkit_donor_leaderboard(timestamptz);
create or replace function public.streamkit_donor_leaderboard(p_since timestamptz default null)
returns table (
  tipper_name text,
  amount numeric,
  currency text,
  tip_count bigint,
  last_tip_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(nullif(trim(t.tipper_name), ''), 'Anonymous'),
    sum(t.amount),
    t.currency,
    count(*)::bigint,
    max(t.created_at)
  from public.tips as t
  where t.creator_id = auth.uid()
    and t.payment_status = 'successful'
    and t.created_at >= coalesce(
      (select credentials.leaderboard_cleared_at
         from public.streamkit_overlay_credentials as credentials
        where credentials.creator_id = auth.uid()),
      '-infinity'::timestamptz)
    and (p_since is null or t.created_at >= p_since)
  group by coalesce(nullif(trim(t.tipper_name), ''), 'Anonymous'), t.currency
  order by sum(t.amount) desc, max(t.created_at) desc
$function$;

revoke all on function public.streamkit_donor_leaderboard(timestamptz) from public, anon;
grant execute on function public.streamkit_donor_leaderboard(timestamptz) to authenticated;
