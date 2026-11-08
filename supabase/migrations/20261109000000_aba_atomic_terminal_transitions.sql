-- Atomically apply verified ABA terminal payment outcomes.
-- This function does not complete payments; successful payments continue
-- through streamkit_complete_aba_payment.

create or replace function public.streamkit_transition_aba_payment(
  p_payment_id uuid,
  p_target_status text,
  p_failure_reason text default null,
  p_webhook_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_donation public.donations%rowtype;
  v_donation_status text;
  v_webhook_id uuid;
begin
  if p_target_status is null or p_target_status not in (
    'failed', 'cancelled', 'refunded', 'expired', 'review_required'
  ) then
    raise exception 'Unsupported ABA payment transition';
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.provider is distinct from 'aba_payway' then
    raise exception 'Payment provider does not match';
  end if;

  -- Validate and lock the webhook before acknowledging it.
  if p_webhook_id is not null then
    select id
    into v_webhook_id
    from public.payment_webhooks
    where id = p_webhook_id
      and provider = 'aba_payway'
      and tran_id = v_payment.tran_id
    for update;

    if not found then
      raise exception 'ABA webhook does not match payment';
    end if;
  end if;

  -- Never downgrade a payment that has already completed.
  if v_payment.status in ('successful', 'completed') then
    if p_webhook_id is not null then
      update public.payment_webhooks
      set processed = true
      where id = p_webhook_id;
    end if;

    return jsonb_build_object(
      'status', v_payment.status,
      'transitioned', false
    );
  end if;

  -- Do not automatically change a different terminal/review state.
  if v_payment.status not in ('pending', 'processing')
    and v_payment.status is distinct from p_target_status
  then
    if p_webhook_id is not null then
      update public.payment_webhooks
      set processed = true
      where id = p_webhook_id;
    end if;

    return jsonb_build_object(
      'status', v_payment.status,
      'transitioned', false
    );
  end if;

  -- An approved-but-mismatched payment needs review. Do not fail its donation.
  if p_target_status <> 'review_required'
    and v_payment.donation_id is not null
  then
    v_donation_status :=
      case
        when p_target_status = 'expired' then 'failed'
        else p_target_status
      end;

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
    then
      raise exception 'Linked donation does not match payment';
    end if;

    if v_donation.status in ('pending', 'processing') then
      update public.donations
      set status = v_donation_status
      where id = v_donation.id;
    elsif v_donation.status is distinct from v_donation_status then
      raise exception 'Linked donation has an incompatible status';
    end if;
  end if;

  if v_payment.status in ('pending', 'processing') then
    update public.payment_transactions
    set status = p_target_status,
        failure_reason = coalesce(p_failure_reason, failure_reason)
    where id = v_payment.id;
  end if;

  -- Acknowledgement is part of the same transaction as both status updates.
  if p_webhook_id is not null then
    update public.payment_webhooks
    set processed = true
    where id = p_webhook_id;
  end if;

  return jsonb_build_object(
    'status', p_target_status,
    'transitioned', v_payment.status in ('pending', 'processing'),
    'donation_id', v_payment.donation_id
  );
end
$function$;

revoke all on function public.streamkit_transition_aba_payment(
  uuid, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.streamkit_transition_aba_payment(
  uuid, text, text, uuid
) to service_role;
