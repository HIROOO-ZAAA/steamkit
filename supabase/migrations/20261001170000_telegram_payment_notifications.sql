create or replace function public.streamkit_claim_telegram_donation_notification(
  p_device_id uuid,
  p_creator_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.telegram_devices%rowtype;
  v_event_id uuid;
begin
  select * into v_device
  from public.telegram_devices
  where id = p_device_id
    and creator_id = p_creator_id
    and status = 'active'
  for update;

  if not found or v_device.telegram_chat_id is null then
    return null;
  end if;

  insert into public.telegram_device_events (
    device_id, event_type, telegram_user_id, metadata
  ) values (
    v_device.id,
    'donation_notification',
    v_device.telegram_user_id,
    jsonb_build_object('payment_id', p_payment_id, 'status', 'sending')
  )
  on conflict (device_id, (metadata ->> 'payment_id'))
    where event_type = 'donation_notification'
  do update set
    metadata = jsonb_build_object('payment_id', p_payment_id, 'status', 'sending'),
    created_at = now()
  where public.telegram_device_events.metadata ->> 'status' = 'failed'
    or (
      public.telegram_device_events.metadata ->> 'status' = 'sending'
      and public.telegram_device_events.created_at < now() - interval '1 minute'
    )
  returning id into v_event_id;

  if v_event_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'chat_id', v_device.telegram_chat_id
  );
end
$function$;

revoke all on function public.streamkit_claim_telegram_donation_notification(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.streamkit_claim_telegram_donation_notification(uuid, uuid, uuid)
  to service_role;