-- Add currency support to donation_goals table and update goal widget
-- This fixes the Goals dashboard currency handling and overlay display

-- 1. Add currency column to donation_goals table
alter table public.donation_goals
  add column if not exists currency text default 'USD' not null;

-- 2. Update streamkit_get_goal_widget function to handle currencies
drop function if exists public.streamkit_get_goal_widget(text);

create or replace function public.streamkit_get_goal_widget(p_token text)
returns table (
  title text,
  target_amount numeric,
  current_amount numeric,
  bar_color text,
  widget jsonb,
  currency text
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
        and t.currency = goals.currency
        and t.created_at > coalesce(v_cleared, '-infinity'::timestamptz)
    ), 0)::numeric as current_amount,
    goals.bar_color,
    goals.widget,
    goals.currency
  from public.donation_goals as goals
  where goals.user_id = v_creator
    and goals.is_active = true
  order by goals.created_at desc
  limit 1;
end
$function$;

revoke all on function public.streamkit_get_goal_widget(text) from public;
grant execute on function public.streamkit_get_goal_widget(text) to anon, authenticated;

-- 3. Add currency to goal_manual_adjustments table (idempotent)
alter table public.goal_manual_adjustments
  add column if not exists currency text default 'USD' not null;

-- 4. Update streamkit_add_goal_adjustment function to handle currency
drop function if exists public.streamkit_add_goal_adjustment(numeric);

create or replace function public.streamkit_add_goal_adjustment(
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_goal record;
  v_currency text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_goal
  from public.donation_goals
  where user_id = v_user
    and is_active = true
  order by created_at desc
  limit 1;

  if v_goal is null then
    raise exception 'No active goal found';
  end if;

  v_currency := v_goal.currency;

  insert into public.goal_manual_adjustments (
    goal_id, amount, currency, created_by
  ) values (
    v_goal.id, p_amount, v_currency, v_user
  );
end
$function$;

revoke all on function public.streamkit_add_goal_adjustment(numeric) from public;
grant execute on function public.streamkit_add_goal_adjustment(numeric) to authenticated;

-- Notify PostgREST
notify pgrst, 'reload schema';
