-- Keep Telegram's original notification time on telegram_aba_notifications, but
-- timestamp the generated tip when it is ingested. OBS polls tips by created_at;
-- using Telegram's possibly delayed message time can put a real payment behind
-- the overlay's cursor so it never appears as an alert.
create or replace function public.streamkit_record_parsed_aba_tip(
  p_token_hash text,
  p_telegram_chat_id text,
  p_telegram_chat_title text,
  p_telegram_message_id bigint,
  p_sender_user_id text,
  p_sender_username text,
  p_message_text text,
  p_telegram_sent_at timestamptz,
  p_tipper_name text,
  p_amount numeric,
  p_currency text,
  p_tip_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_agent public.telegram_local_agents%rowtype;
  v_notification_id uuid;
  v_tip_id uuid;
begin
  if p_token_hash is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_telegram_chat_id is null
    or p_telegram_chat_id !~ '^-?[0-9]{1,20}$'
    or p_telegram_message_id is null
    or p_sender_user_id is null
    or p_sender_user_id !~ '^[0-9]{1,20}$'
    or p_sender_username is null
    or p_message_text is null
    or char_length(p_message_text) > 4000
    or p_amount is null
    or p_amount <= 0
    or p_amount > 10000000
  then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;

  select * into v_agent
  from public.telegram_local_agents
  where token_hash = p_token_hash
    and telegram_chat_id = p_telegram_chat_id
    and payway_bot_username = lower(p_sender_username)
    and expected_sender_user_id = p_sender_user_id
    and revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'agent_not_found');
  end if;

  set local session_replication_role = replica;

  insert into public.telegram_aba_notifications (
    creator_id, telegram_chat_id, telegram_chat_title,
    telegram_message_id, sender_user_id, sender_username,
    message_text, telegram_sent_at
  ) values (
    v_agent.creator_id, p_telegram_chat_id,
    left(nullif(trim(p_telegram_chat_title), ''), 120),
    p_telegram_message_id, p_sender_user_id,
    lower(p_sender_username), trim(p_message_text), p_telegram_sent_at
  )
  on conflict (telegram_chat_id, telegram_message_id) do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    insert into public.tips (
      creator_id, tipper_name, amount, currency, message,
      payment_method, payment_status, created_at
    ) values (
      v_agent.creator_id,
      left(coalesce(nullif(trim(p_tipper_name), ''), 'Anonymous'), 60),
      p_amount,
      case when upper(p_currency) = 'KHR' then 'KHR' else 'USD' end,
      left(nullif(trim(p_tip_message), ''), 300),
      'aba_payway',
      'successful',
      now()
    )
    returning id into v_tip_id;

    update public.telegram_local_agents
    set last_seen_at = now()
    where id = v_agent.id;
  end if;

  set local session_replication_role = origin;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', v_notification_id is null,
    'notification_id', v_notification_id,
    'tip_id', v_tip_id
  );
end
$function$;

revoke all on function public.streamkit_record_parsed_aba_tip(
  text, text, text, bigint, text, text, text, timestamptz, text, numeric, text, text
) from public;
grant execute on function public.streamkit_record_parsed_aba_tip(
  text, text, text, bigint, text, text, text, timestamptz, text, numeric, text, text
) to anon, authenticated;
