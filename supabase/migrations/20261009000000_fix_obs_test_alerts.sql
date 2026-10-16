-- ═══ RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR ═══
-- Fixes: OBS test alerts not showing (missing polling RPC + test tip insert)

-- 1. Overlay polling function (fetches recent tips for the OBS overlay)
create or replace function public.streamkit_recent_alerts(p_token text, p_since timestamptz)
returns table (
  id uuid,
  tipper_name text,
  amount numeric,
  currency text,
  message text,
  payment_status text,
  created_at timestamptz
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
    t.id,
    t.tipper_name,
    t.amount,
    t.currency,
    t.message,
    t.payment_status,
    t.created_at
  from public.tips as t
  where t.creator_id = v_creator
    and t.payment_status in ('successful', 'test')
    and t.created_at > p_since
  order by t.created_at asc
  limit 10;
end
$function$;

revoke all on function public.streamkit_recent_alerts(text, timestamptz) from public;
grant execute on function public.streamkit_recent_alerts(text, timestamptz) to anon, authenticated;

-- 2. Test tip insert (works with the signed-in user's session, no service key needed)
create or replace function public.streamkit_insert_test_tip(
  p_name text,
  p_amount numeric,
  p_currency text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.tips (
    creator_id, tipper_name, amount, currency, message, payment_method, payment_status
  ) values (
    v_user,
    left(coalesce(nullif(trim(p_name), ''), 'Kit Steam Test'), 60),
    greatest(0.01, least(coalesce(p_amount, 10), 1000000)),
    case when p_currency = 'KHR' then 'KHR' else 'USD' end,
    left(coalesce(p_message, ''), 300),
    'test',
    'test'
  )
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.streamkit_insert_test_tip(text, numeric, text, text) from public;
grant execute on function public.streamkit_insert_test_tip(text, numeric, text, text) to authenticated;