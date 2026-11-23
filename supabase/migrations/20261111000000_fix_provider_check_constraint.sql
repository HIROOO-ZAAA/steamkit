-- Fix payment_transactions.provider CHECK constraint to allow both bakong and aba_payway
-- The canonical schema (supabase_schema.sql:34) incorrectly only allows 'bakong'
-- but payment_transactions already stores 'aba_payway' via the payment API

-- Ensure donation_goals has user_id column (added in canonical schema)
alter table public.donation_goals
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Fix payment_transactions.provider CHECK constraint
alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_check;

alter table public.payment_transactions
  add constraint payment_transactions_provider_check
  check (provider in ('bakong', 'aba_payway'));
