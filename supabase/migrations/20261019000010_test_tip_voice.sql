-- Let a creator test a voice message from the alerts dashboard.
--
-- `streamkit_insert_test_tip` has no donation and no payment_transaction_id, so
-- the `tips_copy_donation_media` trigger deliberately skips it. Without this
-- change the dashboard TEST button could never produce an alert carrying
-- `voice_path`, which meant the whole donor-voice path -- intro, playback, the
-- polling fallback -- was only reachable by paying a real donation.
--
-- The two new parameters are optional so the existing four-argument call in
-- src/app/api/alerts/test/route.ts keeps working unchanged.
--
-- DROP is required, not defensive: PostgreSQL will not let CREATE OR REPLACE
-- add parameters to an existing function (42P13). Adding a trailing default
-- pair would create an ambiguous overload rather than replacing the old one,
-- so the four-argument version is removed outright. Nothing else in the
-- database calls it.

drop function if exists public.streamkit_insert_test_tip(text, numeric, text, text);

create function public.streamkit_insert_test_tip(
  p_name text,
  p_amount numeric,
  p_currency text,
  p_message text,
  p_voice_path text default null,
  p_voice_duration_seconds integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_voice text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Re-checked here, not just in the route handler: this function is
  -- security definer and executable by any authenticated user, so the path
  -- must not be trusted from the caller alone. Anything that is not a bare
  -- generated filename is treated as "no voice".
  v_voice := case
    when p_voice_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav)$'
      then p_voice_path
    else null
  end;

  insert into public.tips (
    creator_id, tipper_name, amount, currency, message,
    payment_method, payment_status, voice_path, voice_duration_seconds
  ) values (
    v_user,
    left(coalesce(nullif(trim(p_name), ''), 'Kit Steam Test'), 60),
    greatest(0.01, least(coalesce(p_amount, 10), 1000000)),
    case when p_currency = 'KHR' then 'KHR' else 'USD' end,
    left(coalesce(p_message, ''), 300),
    'test',
    'test',
    v_voice,
    case when v_voice is null then null
      else greatest(1, least(coalesce(p_voice_duration_seconds, 30), 30))
    end
  )
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.streamkit_insert_test_tip(text, numeric, text, text, text, integer) from public;
grant execute on function public.streamkit_insert_test_tip(text, numeric, text, text, text, integer) to authenticated;
