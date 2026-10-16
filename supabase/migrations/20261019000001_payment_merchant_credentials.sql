-- Payment provider merchant credentials.
--
-- Holds one row per provider ('aba_payway' or 'bakong'). The dashboard never
-- talks to this table directly -- it goes through /api/admin/payment-config,
-- which reads and writes with the service-role key. That keeps the secrets out
-- of the browser and means saved credentials apply instantly, with no restart.
create table if not exists public.payment_merchant_credentials (
  provider text primary key,
  env text not null default 'sandbox'
    check (env in ('sandbox', 'production')),
  -- ABA PayWay: merchant id from developer.payway.com.kh.
  -- Bakong: the KHQR account id (e.g. "name@aclb").
  merchant_id text not null,
  -- Bakong: the merchant name and city shown inside the generated QR.
  merchant_name text,
  merchant_city text,
  -- Bakong: the API token. Optional -- a token is only needed to *verify*
  -- that a payment arrived, not to generate the QR itself.
  api_key text not null default '',
  -- ABA PayWay: the API secret used to sign QR requests.
  secret_key text not null default '',
  callback_url text,
  status text not null default 'unconfigured'
    check (status in ('unconfigured', 'ok', 'failed')),
  validated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Columns added later still need to exist if the table predates them.
alter table public.payment_merchant_credentials
  add column if not exists merchant_name text,
  add column if not exists merchant_city text;

alter table public.payment_merchant_credentials enable row level security;
revoke all on table public.payment_merchant_credentials from anon, authenticated;
grant all on table public.payment_merchant_credentials to service_role;

-- No RLS policies are created on purpose: service_role bypasses RLS, so the
-- only path to these rows is the authenticated admin API route.
drop policy if exists "Anyone can read payment credentials" on public.payment_merchant_credentials;