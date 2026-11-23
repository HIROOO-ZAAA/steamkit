-- Stop authenticated creators from reading other creators' donor records.
-- Public tip widgets use token-scoped SECURITY DEFINER functions, while the
-- public creator page receives only a bounded supporter list without messages.

drop policy if exists "Tips viewable by all" on public.tips;
drop policy if exists "Creators view own tips" on public.tips;
create policy "Creators view own tips"
  on public.tips
  for select to authenticated
  using (auth.uid() = creator_id);

create or replace function public.streamkit_get_public_creator_supporters(
  p_username text,
  p_limit integer default 10
)
returns table (
  id uuid,
  tipper_name text,
  amount numeric,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id,
    coalesce(nullif(pg_catalog.btrim(t.tipper_name), ''), 'Supporter'),
    t.amount,
    t.currency
  from public.tips as t
  join public.profiles as p on p.id = t.creator_id
  where pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(p_username))
    and t.payment_status = 'successful'
  order by t.amount desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 10);
$function$;

revoke all on function public.streamkit_get_public_creator_supporters(text, integer) from public;
grant execute on function public.streamkit_get_public_creator_supporters(text, integer) to anon, authenticated;

-- The spin-wheel overlay needs only a token-scoped event signal, not alert
-- messages or attached media. Polling this RPC avoids exposing tips through
-- anonymous Realtime subscriptions.
create or replace function public.streamkit_recent_spin_tips(
  p_token text,
  p_since timestamptz
)
returns table (
  id uuid,
  tipper_name text,
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
  select t.id, t.tipper_name, t.payment_status, t.created_at
  from public.tips as t
  where t.creator_id = v_creator
    and t.payment_status in ('successful', 'test')
    and t.created_at > p_since
  order by t.created_at asc
  limit 100;
end
$function$;

revoke all on function public.streamkit_recent_spin_tips(text, timestamptz) from public;
grant execute on function public.streamkit_recent_spin_tips(text, timestamptz) to anon, authenticated;
