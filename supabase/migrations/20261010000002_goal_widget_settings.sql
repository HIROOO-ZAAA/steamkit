alter table public.donation_goals
  add column if not exists widget jsonb default '{}'::jsonb not null;

drop function if exists public.streamkit_get_goal_widget(text);

create or replace function public.streamkit_get_goal_widget(p_token text)
returns table (
  title text,
  target_amount numeric,
  current_amount numeric,
  bar_color text,
  widget jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
begin
  select credentials.creator_id into v_creator
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
    ), 0)::numeric as current_amount,
    goals.bar_color,
    goals.widget
  from public.donation_goals as goals
  where goals.user_id = v_creator
    and goals.is_active = true
  order by goals.created_at desc
  limit 1;
end
$function$;

revoke all on function public.streamkit_get_goal_widget(text) from public;
grant execute on function public.streamkit_get_goal_widget(text) to anon, authenticated;
