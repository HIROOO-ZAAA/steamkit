-- Atomically complete Bakong payments and allow a bounded verification grace.
-- A payment may be verified for 10 minutes after QR expiry, but the provider
-- must confirm that the actual payment occurred no later than expires_at.

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
  v_donation public.donations%rowtype;
  v_donation_id uuid;
  v_tip_id uuid;
begin
  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.provider <> 'bakong' then
    raise exception 'Payment provider does not match';
  end if;

  if v_payment.status = 'successful' then
    if v_payment.donation_id is null then
      raise exception 'Successful payment is missing its donation link';
    end if;

    select id
    into v_donation_id
    from public.donations
    where id = v_payment.donation_id;

    if not found then
      raise exception 'Successful payment is linked to a missing donation';
    end if;

    select id
    into v_tip_id
    from public.tips
    where payment_transaction_id = v_payment.id;

    if v_tip_id is null then
      raise exception 'Successful payment is missing its tip record';
    end if;

    return jsonb_build_object(
      'status', 'successful',
      'donation_id', v_payment.donation_id,
      'tip_id', v_tip_id
    );
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment intent is not pending';
  end if;

  if now() > v_payment.expires_at + interval '10 minutes'
    or p_provider_hash is null
    or btrim(p_provider_hash) = ''
    or p_provider_paid_at is null
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at
    or p_verified_amount is distinct from v_payment.amount
    or p_verified_currency is distinct from v_payment.currency
    or p_verified_account_id is null
    or p_expected_account_id is null
    or lower(btrim(p_verified_account_id))
       is distinct from lower(btrim(p_expected_account_id))
  then
    raise exception 'Provider transaction does not match payment intent';
  end if;

  if v_payment.donation_id is null then
    insert into public.donations (
      creator_id,
      donor_name,
      message,
      amount,
      currency,
      status,
      completed_at
    )
    values (
      v_payment.creator_id,
      v_payment.donor_name,
      v_payment.message,
      v_payment.amount,
      v_payment.currency,
      'completed',
      p_provider_paid_at
    )
    returning id into v_donation_id;
  else
    select *
    into v_donation
    from public.donations
    where id = v_payment.donation_id
    for update;

    if not found then
      raise exception 'Linked donation record not found';
    end if;

    if v_donation.creator_id is distinct from v_payment.creator_id
      or v_donation.donor_name is distinct from v_payment.donor_name
      or v_donation.amount is distinct from v_payment.amount
      or v_donation.currency is distinct from v_payment.currency
      or v_donation.status not in ('pending', 'processing')
    then
      raise exception 'Linked donation does not match payment intent';
    end if;

    update public.donations
    set status = 'completed',
        completed_at = p_provider_paid_at
    where id = v_payment.donation_id
    returning id into v_donation_id;
  end if;

  -- Link the donation before inserting the tip. The existing BEFORE INSERT
  -- trigger uses this link to copy photo and voice media onto the tip.
  update public.payment_transactions
  set status = 'successful',
      donation_id = v_donation_id,
      provider_hash = p_provider_hash,
      provider_paid_at = p_provider_paid_at,
      verified_at = now()
  where id = v_payment.id;

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
    v_payment.creator_id,
    v_payment.donor_name,
    v_payment.amount,
    v_payment.currency,
    v_payment.message,
    'bakong',
    'successful',
    v_payment.id
  )
  returning id into v_tip_id;

  return jsonb_build_object(
    'status', 'successful',
    'donation_id', v_donation_id,
    'tip_id', v_tip_id
  );
end
$function$;

revoke all on function public.streamkit_complete_bakong_payment(
  uuid, text, numeric, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.streamkit_complete_bakong_payment(
  uuid, text, numeric, text, text, text, timestamptz
) to service_role;
