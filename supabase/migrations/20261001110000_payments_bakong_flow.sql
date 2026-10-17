create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  donor_name text not null default 'Anonymous',
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  message text,
  provider text not null check (provider = 'bakong'),
  provider_md5 text not null unique,
  provider_hash text unique,
  status text not null default 'pending'
    check (status in ('pending', 'successful', 'failed', 'expired', 'review_required')),
  expires_at timestamptz not null,
  provider_paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.payment_transactions enable row level security;
revoke all on table public.payment_transactions from anon, authenticated;
grant all on table public.payment_transactions to service_role;

create table if not exists public.payment_request_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count > 0)
);
alter table public.payment_request_limits enable row level security;
revoke all on table public.payment_request_limits from anon, authenticated;
grant all on table public.payment_request_limits to service_role;

create or replace function public.streamkit_allow_payment_request(
  p_fingerprint text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hit_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit';
  end if;

  insert into public.payment_request_limits (fingerprint, window_started_at, hit_count)
  values (p_fingerprint, timezone('utc'::text, now()), 1)
  on conflict (fingerprint) do update
  set window_started_at = case
        when public.payment_request_limits.window_started_at <= timezone('utc'::text, now()) - make_interval(secs => p_window_seconds)
          then timezone('utc'::text, now())
        else public.payment_request_limits.window_started_at
      end,
      hit_count = case
        when public.payment_request_limits.window_started_at <= timezone('utc'::text, now()) - make_interval(secs => p_window_seconds)
          then 1
        else public.payment_request_limits.hit_count + 1
      end
  returning hit_count into v_hit_count;

  return v_hit_count <= p_limit;
end
$function$;

revoke all on function public.streamkit_allow_payment_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.streamkit_allow_payment_request(text, integer, integer) to service_role;

alter table public.tips
  add column if not exists payment_transaction_id uuid unique
  references public.payment_transactions(id) on delete set null;
alter table public.tips
  add column if not exists payment_method text not null default 'aba',
  add column if not exists payment_status text not null default 'pending';
alter table public.tips alter column payment_status set default 'pending';
drop policy if exists "Anyone insert tips" on public.tips;

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
begin
  select * into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.status = 'successful' then
    select id into v_tip_id
    from public.tips
    where payment_transaction_id = v_payment.id;
    return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id);
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

  insert into public.tips (
    creator_id,
    tipper_name,
    amount,
    currency,
    message,
    payment_method,
    payment_status,
    payment_transaction_id
  ) values (
    v_payment.creator_id,
    v_payment.donor_name,
    v_payment.amount,
    v_payment.currency,
    v_payment.message,
    'bakong',
    'successful',
    v_payment.id
  ) returning id into v_tip_id;

  return jsonb_build_object('status', 'successful', 'tip_id', v_tip_id);
end
$function$;

revoke all on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.streamkit_complete_bakong_payment(uuid, text, numeric, text, text, text, timestamptz) to service_role;