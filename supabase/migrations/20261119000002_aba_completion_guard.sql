do $guard$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'streamkit_complete_aba_payment'
      and pg_get_function_result(p.oid) <> 'void'
  ) then
    raise exception 'streamkit_complete_aba_payment has a non-void return type';
  end if;
end
$guard$;

create or replace function public.streamkit_complete_aba_payment(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_provider_paid_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_subscription_tier_id uuid;
  v_subscription_id uuid;
  v_is_subscription boolean := false;
begin
  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status in ('successful', 'completed') then
    return;
  end if;

  if v_payment.provider is distinct from 'aba_payway'
    or v_payment.status not in ('pending', 'processing') then
    raise exception 'Payment intent is not payable';
  end if;

  if p_verified_amount is null
    or p_verified_currency is null
    or p_provider_paid_at is null
    or v_payment.expires_at is null
    or p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at then
    raise exception 'Verified transaction does not match payment intent';
  end if;

  update public.payment_transactions
  set status = 'successful',
      provider_transaction_id = p_provider_transaction_id,
      provider_paid_at = p_provider_paid_at,
      updated_at = now()
  where id = v_payment.id;

  v_subscription_tier_id := (v_payment.metadata ->> 'subscription_tier_id')::uuid;
  v_is_subscription := v_subscription_tier_id is not null;

  if v_is_subscription then
    insert into public.subscriptions (
      tier_id,
      creator_id,
      user_id,
      status,
      current_period_start,
      current_period_end,
      payment_provider,
      provider_subscription_id,
      provider_customer_id,
      last_payment_id,
      metadata
    ) values (
      v_subscription_tier_id,
      v_payment.creator_id,
      case when v_payment.metadata ->> 'subscriber_id' is not null
        then (v_payment.metadata ->> 'subscriber_id')::uuid
        else v_payment.creator_id
      end,
      'active',
      now(),
      now() + interval '1 month',
      'aba_payway',
      v_payment.metadata ->> 'provider_subscription_id',
      v_payment.metadata ->> 'provider_customer_id',
      v_payment.id,
      v_payment.metadata
    ) returning id into v_subscription_id;

    update public.payment_transactions
    set subscription_id = v_subscription_id,
        subscription_type = 'new'
    where id = v_payment.id;
  else
    update public.donations
    set status = 'completed',
        updated_at = now()
    where id = v_payment.donation_id;

    insert into public.tips (
      creator_id, tipper_name, amount, currency, message,
      payment_method, payment_status, payment_transaction_id
    ) values (
      v_payment.creator_id,
      v_payment.donor_name,
      v_payment.amount,
      v_payment.currency,
      v_payment.message,
      'aba_payway',
      'successful',
      v_payment.id
    )
    on conflict do nothing;
  end if;
end
$function$;

revoke all on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz) to service_role;
