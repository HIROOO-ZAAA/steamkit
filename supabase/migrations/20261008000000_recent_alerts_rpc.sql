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