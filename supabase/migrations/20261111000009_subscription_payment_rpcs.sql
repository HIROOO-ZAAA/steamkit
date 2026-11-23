-- Extend payment completion RPCs to support subscription creation
-- These replace the existing functions in supabase_schema.sql with subscription-aware versions

-- ============================================================
-- streamkit_complete_bakong_payment (extended for subscriptions)
-- ============================================================
create or replace function public.streamkit_complete_bakong_payment(
  p_payment_id uuid,
  p_provider_hash text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_verified_account_id text,
  p_expected_account_id text,
  p_provider_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_tip_id uuid;
  v_subscription_id uuid;
  v_subscription_tier_id uuid;
  v_is_subscription boolean := false;
begin
  select * into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.status = 'successful' then
    select id into v_tip_id from public.tips where payment_transaction_id = v_payment.id;
    return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id, 'subscription_id', v_subscription_id);
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment intent is not pending';
  end if;

  if v_payment.expires_at <= timezone('utc'::text, now())
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at
    or p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
    or lower(p_verified_account_id) <> lower(p_expected_account_id)
  then
    raise exception 'Provider transaction does not match payment intent';
  end if;

  update public.payment_transactions
  set status = 'successful',
      provider_hash = p_provider_hash,
      provider_paid_at = p_provider_paid_at,
      verified_at = timezone('utc'::text, now())
  where id = v_payment.id;

  -- Check if this payment is for a subscription
  v_subscription_tier_id := v_payment.metadata ->> 'subscription_tier_id';
  v_is_subscription := v_subscription_tier_id is not null;

  if v_is_subscription then
    -- Create subscription row
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
      v_subscription_tier_id::uuid,
      v_payment.creator_id,
      case when v_payment.metadata ->> 'subscriber_id' is not null
        then (v_payment.metadata ->> 'subscriber_id')::uuid
        else v_payment.creator_id
      end,
      'active',
      now(),
      now() + interval '1 month',
      'bakong',
      v_payment.metadata ->> 'provider_subscription_id',
      v_payment.metadata ->> 'provider_customer_id',
      v_payment.id,
      v_payment.metadata
    ) returning id into v_subscription_id;

    -- Link payment to subscription
    update public.payment_transactions
    set subscription_id = v_subscription_id,
        subscription_type = 'new'
    where id = v_payment.id;
  else
    -- Regular tip/donation
    insert into public.tips (
      creator_id, tipper_name, amount, currency, message, payment_method,
      payment_status, payment_transaction_id
    ) values (
      v_payment.creator_id, v_payment.donor_name, v_payment.amount,
      v_payment.currency, v_payment.message, 'bakong', 'successful', v_payment.id
    ) returning id into v_tip_id;
  end if;

  return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id, 'subscription_id', v_subscription_id);
end
$function$;

revoke all on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) to service_role;

-- ============================================================
-- streamkit_complete_aba_payment (extended for subscriptions)
-- ============================================================
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

-- ============================================================
-- New: streamkit_handle_subscription_renewal
-- Handles renewal payments for existing subscriptions
-- ============================================================
create or replace function public.streamkit_handle_subscription_renewal(
  p_payment_id uuid,
  p_provider_hash text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_provider_paid_at timestamptz,
  p_provider_subscription_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_new_period_end timestamptz;
begin
  select * into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.status = 'successful' then
    return jsonb_build_object('status', 'successful', 'subscription_id', v_payment.subscription_id);
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment intent is not pending';
  end if;

  -- Verify subscription exists
  select * into v_subscription
  from public.subscriptions
  where id = v_payment.subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  if v_subscription.status not in ('active', 'trialing', 'past_due') then
    raise exception 'Subscription not eligible for renewal';
  end if;

  -- Verify payment matches subscription tier
  if p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
  then
    raise exception 'Provider transaction does not match subscription payment intent';
  end if;

  -- Calculate new period end
  if v_subscription.current_period_end > now() then
    v_new_period_end := v_subscription.current_period_end + interval '1 month';
  else
    v_new_period_end := now() + interval '1 month';
  end if;

  update public.payment_transactions
  set status = 'successful',
      provider_hash = p_provider_hash,
      provider_paid_at = p_provider_paid_at,
      verified_at = timezone('utc'::text, now()),
      subscription_type = 'renewal'
  where id = v_payment.id;

  update public.subscriptions
  set current_period_start = v_subscription.current_period_end,
      current_period_end = v_new_period_end,
      status = case
        when v_subscription.status = 'past_due' then 'active'
        else v_subscription.status
      end,
      last_payment_id = v_payment.id,
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object('status', 'successful', 'subscription_id', v_subscription.id, 'new_period_end', v_new_period_end);
end
$function$;

revoke all on function public.streamkit_handle_subscription_renewal(uuid, text, numeric, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.streamkit_handle_subscription_renewal(uuid, text, numeric, text, timestamptz, text) to service_role;

-- ============================================================
-- New: streamkit_cancel_subscription
-- Soft cancel - sets cancel_at_period_end = true
-- ============================================================
create or replace function public.streamkit_cancel_subscription(
  p_subscription_id uuid,
  p_actor_id uuid,
  p_immediate boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.subscriptions%rowtype;
  v_tier public.subscription_tiers%rowtype;
begin
  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  -- Verify actor has permission (creator of tier or member themselves)
  select * into v_tier
  from public.subscription_tiers
  where id = v_subscription.tier_id;

  if v_tier.user_id <> p_actor_id and v_subscription.user_id <> p_actor_id then
    raise exception 'Insufficient permissions to cancel this subscription';
  end if;

  if p_immediate then
    update public.subscriptions
    set status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    where id = p_subscription_id;

    return jsonb_build_object('status', 'cancelled', 'cancelled_at', now());
  else
    update public.subscriptions
    set cancel_at_period_end = true,
        updated_at = now()
    where id = p_subscription_id;

    return jsonb_build_object('status', 'active', 'cancel_at_period_end', true, 'period_end', v_subscription.current_period_end);
  end if;
end
$function$;

revoke all on function public.streamkit_cancel_subscription(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.streamkit_cancel_subscription(uuid, uuid, boolean) to service_role, authenticated;

-- ============================================================
-- New: streamkit_expire_due_subscriptions
-- Scheduled job: expires past_due subscriptions past grace period
-- ============================================================
create or replace function public.streamkit_expire_due_subscriptions(
  p_grace_period_days integer default 7
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  update public.subscriptions
  set status = 'expired',
      updated_at = now()
  where status = 'past_due'
    and current_period_end < now() - (p_grace_period_days || ' days')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

revoke all on function public.streamkit_expire_due_subscriptions(integer) from public, anon, authenticated;
grant execute on function public.streamkit_expire_due_subscriptions(integer) to service_role;