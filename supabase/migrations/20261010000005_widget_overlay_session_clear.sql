-- Widget overlay fixes: session clear + data source aware leaderboard

alter table public.streamkit_overlay_credentials
  add column if not exists widget_cleared_at timestamptz;

create or replace function public.streamkit_get_widget_leaderboard(p_token text)
returns table (
  tipper_name text,
  total_amount numeric,
  tip_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
  v_settings jsonb;
  v_cleared timestamptz;
  v_source text;
  v_since timestamptz;
begin
  select credentials.creator_id, credentials.widget_settings, credentials.widget_cleared_at
    into v_creator, v_settings, v_cleared
  from public.streamkit_overlay_credentials as credentials
  where credentials.widget_token = p_token;

  if v_creator is null then
    return;
  end if;

  v_source := coalesce(v_settings->>'dataSource', 'All-Time Top Donors');
  v_since := v_cleared;
  if v_source = 'This Month' then
    v_since := greatest(coalesce(v_cleared, '-infinity'::timestamptz), now() - interval '30 days');
  elsif v_source = 'This Week' then
    v_since := greatest(coalesce(v_cleared, '-infinity'::timestamptz), now() - interval '7 days');
  end if;

  if v_source = 'Most Recent (History)' then
    return query
    select
      t.tipper_name,
      sum(t.amount)::numeric as total_amount,
      count(*)::bigint as tip_count
    from public.tips as t
    where t.creator_id = v_creator
      and t.payment_status in ('successful', 'test')
      and t.currency = 'USD'
      and t.created_at > coalesce(v_since, '-infinity'::timestamptz)
    group by t.tipper_name
    order by max(t.created_at) desc
    limit 10;
  else
    return query
    select
      t.tipper_name,
      sum(t.amount)::numeric as total_amount,
      count(*)::bigint as tip_count
    from public.tips as t
    where t.creator_id = v_creator
      and t.payment_status in ('successful', 'test')
      and t.currency = 'USD'
      and t.created_at > coalesce(v_since, '-infinity'::timestamptz)
    group by t.tipper_name
    order by total_amount desc
    limit 10;
  end if;
end
$function$;

revoke all on function public.streamkit_get_widget_leaderboard(text) from public;
grant execute on function public.streamkit_get_widget_leaderboard(text) to anon, authenticated;

-- Hard delete instead of only a timestamp (keeps everything consistent after you clear)
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
