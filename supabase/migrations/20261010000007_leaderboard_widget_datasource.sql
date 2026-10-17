-- Make the leaderboard widget honor its Data Source setting

alter table public.streamkit_overlay_credentials
  add column if not exists leaderboard_cleared_at timestamptz;

drop function if exists public.streamkit_get_leaderboard_widget(text);

create or replace function public.streamkit_get_leaderboard_widget(p_token text)
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
  select credentials.creator_id, credentials.leaderboard_widget,
         credentials.leaderboard_cleared_at
    into v_creator, v_settings, v_cleared
  from public.streamkit_overlay_credentials as credentials
  where credentials.token = p_token;

  if v_creator is null then
    return;
  end if;

  v_source := coalesce(v_settings->>'dataSource', 'Most Recent (History)');

  if v_source in ('Top (Weekly)', 'Top Total (Weekly)', 'This Week') then
    v_since := greatest(coalesce(v_cleared, '-infinity'::timestamptz), now() - interval '7 days');
  elsif v_source in ('Top (Monthly)', 'Top Total (Monthly)', 'This Month') then
    v_since := greatest(coalesce(v_cleared, '-infinity'::timestamptz), now() - interval '30 days');
  else
    v_since := coalesce(v_cleared, '-infinity'::timestamptz);
  end if;

  if v_source in ('Top (Session)', 'Top (Weekly)', 'Top (Monthly)') then
    return query
    select
      (array_agg(t.tipper_name order by t.created_at desc))[1] as tipper_name,
      max(t.amount)::numeric as total_amount,
      count(*)::bigint as tip_count
    from public.tips as t
    where t.creator_id = v_creator
      and t.payment_status in ('successful', 'test')
      and t.currency = 'USD'
      and t.created_at > v_since
    group by lower(btrim(t.tipper_name))
    order by max(t.amount) desc
    limit 10;
  elsif v_source = 'Most Recent (History)' then
    return query
    select
      (array_agg(t.tipper_name order by t.created_at desc))[1] as tipper_name,
      sum(t.amount)::numeric as total_amount,
      count(*)::bigint as tip_count
    from public.tips as t
    where t.creator_id = v_creator
      and t.payment_status in ('successful', 'test')
      and t.currency = 'USD'
      and t.created_at > v_since
    group by lower(btrim(t.tipper_name))
    order by max(t.created_at) desc
    limit 10;
  else
    return query
    select
      (array_agg(t.tipper_name order by t.created_at desc))[1] as tipper_name,
      sum(t.amount)::numeric as total_amount,
      count(*)::bigint as tip_count
    from public.tips as t
    where t.creator_id = v_creator
      and t.payment_status in ('successful', 'test')
      and t.currency = 'USD'
      and t.created_at > v_since
    group by lower(btrim(t.tipper_name))
    order by total_amount desc
    limit 10;
  end if;
end
$function$;

revoke all on function public.streamkit_get_leaderboard_widget(text) from public;
grant execute on function public.streamkit_get_leaderboard_widget(text) to anon, authenticated;
