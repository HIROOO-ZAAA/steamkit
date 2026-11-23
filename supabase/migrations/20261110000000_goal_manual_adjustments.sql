-- Secure manual goal adjustments without granting client INSERT on tips.
create or replace function public.streamkit_add_goal_adjustment(
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_tip_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if p_amount is null
     or p_amount = 0
     or p_amount > 10000
     or p_amount < -10000 then
    raise exception 'Adjustment must be non-zero and between -10000 and 10000 USD'
      using errcode = '22023';
  end if;

  insert into public.tips (
    creator_id,
    tipper_name,
    amount,
    currency,
    message,
    payment_method,
    payment_status,
    payment_transaction_id
  )
  values (
    v_user,
    'Manual Adjust',
    p_amount,
    'USD',
    'Goal adjustment',
    'manual',
    'test',
    null
  )
  returning id into v_tip_id;

  return v_tip_id;
end;
$function$;

revoke all on function public.streamkit_add_goal_adjustment(numeric)
  from public, anon, authenticated, service_role;

grant execute on function public.streamkit_add_goal_adjustment(numeric)
  to authenticated;

-- Fail migration if the intended function security or ACL is not present.
do $verification$
declare
  v_function oid := 'public.streamkit_add_goal_adjustment(numeric)'::regprocedure;
  v_config text[];
begin
  select proconfig into v_config
  from pg_catalog.pg_proc
  where oid = v_function;

  if not coalesce(v_config @> array['search_path=""'], false) then
    raise exception 'Goal adjustment RPC must have an empty search_path';
  end if;

  if not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = v_function
  ) then
    raise exception 'Goal adjustment RPC must be SECURITY DEFINER';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'anon must not execute goal adjustment RPC';
  end if;

  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'authenticated must execute goal adjustment RPC';
  end if;

  if has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role must not execute goal adjustment RPC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = v_function
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not execute goal adjustment RPC';
  end if;
end;
$verification$;