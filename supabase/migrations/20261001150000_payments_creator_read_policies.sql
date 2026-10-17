grant select on table public.payment_transactions to authenticated;

drop policy if exists "Creators view own payment transactions"
  on public.payment_transactions;
create policy "Creators view own payment transactions"
  on public.payment_transactions
  for select to authenticated
  using (auth.uid() = creator_id);