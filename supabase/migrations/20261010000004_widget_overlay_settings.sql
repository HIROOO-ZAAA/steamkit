alter table public.streamkit_overlay_credentials
  add column if not exists widget_token text unique default gen_random_uuid()::text;

alter table public.streamkit_overlay_credentials
  add column if not exists widget_settings jsonb default '{}'::jsonb not null;

update public.streamkit_overlay_credentials
set widget_token = gen_random_uuid()::text
where widget_token is null;

alter table public.streamkit_overlay_credentials
  alter column widget_token set not null;

create or replace function public.streamkit_get_widget_overlay_settings(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
begin
  select credentials.widget_settings into v_settings
  from public.streamkit_overlay_credentials as credentials
  where credentials.widget_token = p_token;
  return coalesce(v_settings, '{}'::jsonb);
end
$function$;

revoke all on function public.streamkit_get_widget_overlay_settings(text) from public;
grant execute on function public.streamkit_get_widget_overlay_settings(text) to anon, authenticated;

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
begin
  select credentials.creator_id into v_creator
  from public.streamkit_overlay_credentials as credentials
  where credentials.widget_token = p_token;

  if v_creator is null then
    return;
  end if;

  return query
  select
    (array_agg(t.tipper_name order by t.created_at desc))[1] as tipper_name,
    sum(t.amount)::numeric as total_amount,
    count(*)::bigint as tip_count
  from public.tips as t
  where t.creator_id = v_creator
    and t.payment_status in ('successful', 'test')
    and t.currency = 'USD'
  group by lower(btrim(t.tipper_name))
  order by total_amount desc
  limit 10;
end
$function$;

revoke all on function public.streamkit_get_widget_leaderboard(text) from public;
grant execute on function public.streamkit_get_widget_leaderboard(text) to anon, authenticated;
