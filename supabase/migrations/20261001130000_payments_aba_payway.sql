create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  donor_name text not null default 'Anonymous',
  donor_email text,
  message text,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

alter table public.donations enable row level security;
revoke all on table public.donations from anon, authenticated;
grant select on table public.donations to authenticated, service_role;
drop policy if exists "Creators view own donations" on public.donations;
create policy "Creators view own donations"
  on public.donations for select to authenticated
  using (auth.uid() = creator_id);

alter table public.payment_transactions
  alter column provider_md5 drop not null;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_check,
  drop constraint if exists payment_transactions_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_provider_check
    check (provider in ('bakong', 'aba_payway')),
  add constraint payment_transactions_status_check
    check (status in (
      'pending', 'processing', 'successful', 'completed', 'failed',
      'expired', 'cancelled', 'refunded', 'review_required'
    ));

alter table public.payment_transactions
  add column if not exists donation_id uuid references public.donations(id) on delete set null,
  add column if not exists tran_id text unique,
  add column if not exists provider_transaction_id text,
  add column if not exists idempotency_key text unique,
  add column if not exists qr_string text,
  add column if not exists qr_image text,
  add column if not exists deeplink text,
  add column if not exists failure_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

create table if not exists public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  tran_id text,
  event_type text not null,
  payload jsonb not null,
  signature text,
  processed boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.payment_webhooks enable row level security;
revoke all on table public.payment_webhooks from anon, authenticated;
grant all on table public.payment_webhooks to service_role;

alter table public.donation_goals
  add column if not exists deadline date;

alter table public.subathons
  add column if not exists ends_at timestamptz;

create or replace function public.streamkit_complete_aba_payment(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_provider_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payment_transactions%rowtype;
  v_donation_id uuid;
  v_tip_id uuid;
begin
  select * into v_payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_payment.status in ('completed', 'successful') then
    return jsonb_build_object('status', 'completed', 'donation_id', v_payment.donation_id);
  end if;

  if v_payment.provider <> 'aba_payway' or v_payment.status not in ('pending', 'processing') then
    raise exception 'Payment intent is not payable';
  end if;

  if p_verified_amount <> v_payment.amount
    or p_verified_currency <> v_payment.currency
    or p_provider_paid_at < v_payment.created_at - interval '1 minute'
    or p_provider_paid_at > v_payment.expires_at
  then
    raise exception 'Verified transaction does not match payment intent';
  end if;

  if v_payment.donation_id is null then
    insert into public.donations (
      creator_id, donor_name, message, amount, currency, status, completed_at
    ) values (
      v_payment.creator_id, v_payment.donor_name, v_payment.message,
      v_payment.amount, v_payment.currency, 'completed', p_provider_paid_at
    ) returning id into v_donation_id;
  else
    update public.donations
    set status = 'completed', completed_at = p_provider_paid_at
    where id = v_payment.donation_id
    returning id into v_donation_id;
    if not found then
      raise exception 'Donation record not found';
    end if;
  end if;

  update public.payment_transactions
  set status = 'completed',
      provider_transaction_id = p_provider_transaction_id,
      donation_id = v_donation_id,
      completed_at = p_provider_paid_at
  where id = v_payment.id;

  insert into public.tips (
    creator_id, tipper_name, amount, currency, message,
    payment_method, payment_status, payment_transaction_id
  ) values (
    v_payment.creator_id, v_payment.donor_name, v_payment.amount,
    v_payment.currency, v_payment.message, 'aba_payway', 'successful', v_payment.id
  ) returning id into v_tip_id;

  return jsonb_build_object(
    'status', 'completed',
    'donation_id', v_donation_id,
    'tip_id', v_tip_id
  );
end
$function$;

revoke all on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.streamkit_complete_aba_payment(uuid, text, numeric, text, timestamptz)
  to service_role;

create or replace function public.streamkit_donor_leaderboard(p_since timestamptz default null)
returns table (
  tipper_name text,
  amount numeric,
  currency text,
  tip_count bigint,
  last_tip_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(nullif(trim(t.tipper_name), ''), 'Anonymous'),
    sum(t.amount),
    t.currency,
    count(*)::bigint,
    max(t.created_at)
  from public.tips as t
  where t.creator_id = auth.uid()
    and t.payment_status = 'successful'
    and (p_since is null or t.created_at >= p_since)
  group by coalesce(nullif(trim(t.tipper_name), ''), 'Anonymous'), t.currency
  order by sum(t.amount) desc, max(t.created_at) desc
$function$;

revoke all on function public.streamkit_donor_leaderboard(timestamptz)
  from public, anon;
grant execute on function public.streamkit_donor_leaderboard(timestamptz)
  to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'donations'
  ) then
    alter publication supabase_realtime add table public.donations;
  end if;
end
$publication$;


-- service_role needs full DML on donations because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.donations to service_role;
