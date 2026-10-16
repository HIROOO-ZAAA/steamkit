-- Brace-free ABA PayWay parser. No {n,m} quantifiers are used so this
-- function can never throw "invalid repetition count(s)".
-- Handles: "$0.20 paid by CHEA LYHENG (*678)", "$0.20 from JOHN DOE",
--          "KHR 40,000", "៛40,000", "10 USD", "40000 KHR".

create or replace function public.streamkit_parse_aba_tip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_amount numeric;
  v_currency text;
  v_donor text;
  v_message text;
  v_m text[];
begin
  -- Currency-first: "$0.20", "$ 0.20", "USD 10.00", "KHR 40,000", "៛40,000"
  v_m := regexp_match(new.message_text, '(\$|៛|USD|KHR)\s*([0-9][0-9,]*(\.[0-9]+)?)', 'i');
  if v_m is not null then
    v_amount := replace(v_m[2], ',', '')::numeric;
    v_currency := v_m[1];
  else
    -- Amount-first: "10 USD", "40000 KHR"
    v_m := regexp_match(new.message_text, '([0-9][0-9,]*(\.[0-9]+)?)\s*(\$|៛|USD|KHR)', 'i');
    if v_m is not null then
      v_amount := replace(v_m[1], ',', '')::numeric;
      v_currency := v_m[3];
    end if;
  end if;

  if v_amount is null then
    return new;
  end if;

  case upper(v_currency)
    when '$' then v_currency := 'USD';
    when '៛' then v_currency := 'KHR';
    else v_currency := upper(v_currency);
  end case;

  -- Donor: "paid by CHEA LYHENG (*678)" -> CHEA LYHENG ; "from JOHN DOE" -> JOHN DOE
  v_m := regexp_match(new.message_text, '(?:paid\s+by|from|donor|payer)\s*:?\s*([^\s\(\n\r]+(?:\s+[^\s\(\n\r]+)*)', 'i');
  if v_m is not null then
    v_donor := v_m[1];
  end if;

  -- Optional remark: "message / remark / note / memo"
  v_m := regexp_match(new.message_text, '(?:message|remark|note|memo)\s*:?\s*([^\n]+)', 'i');
  if v_m is not null then
    v_message := v_m[1];
  end if;

  insert into public.tips (
    creator_id, tipper_name, amount, currency, message,
    payment_method, payment_status, created_at
  ) values (
    new.creator_id,
    coalesce(nullif(trim(v_donor), ''), 'Anonymous'),
    v_amount,
    coalesce(v_currency, 'USD'),
    nullif(trim(coalesce(v_message, '')), ''),
    'aba_payway',
    'successful',
    coalesce(new.telegram_sent_at, new.received_at)
  );

  return new;
end
$function$;

drop trigger if exists telegram_aba_notifications_to_tips on public.telegram_aba_notifications;
create trigger telegram_aba_notifications_to_tips
  after insert on public.telegram_aba_notifications
  for each row execute function public.streamkit_parse_aba_tip();