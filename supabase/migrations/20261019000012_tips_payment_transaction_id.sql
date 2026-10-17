-- supabase/migrations/20261019000012_tips_payment_transaction_id.sql
--
-- Restores the column the tips media trigger depends on.
--
-- NOTE: ASCII only, deliberately. These migrations are pasted by hand into the
-- Supabase SQL editor, and non-ASCII characters have survived that trip as
-- mojibake (an em dash became three bytes of cp1252 garbage), which turns a
-- comment line into something the parser rejects. No box drawing, no dashes
-- beyond "-".
--
-- WHAT HAPPENED
--   20261019000009_donation_voice_messages.sql installed a BEFORE INSERT
--   trigger on public.tips whose body reads new.payment_transaction_id.
--   That column is created by an earlier migration,
--   20261001110000_bakong_payment_flow.sql, and it is NOT present on this
--   database.
--
--   Confirmed by probing the live schema on 2026-10-16:
--     tips.payment_method         present  (same migration, later statement)
--     tips.payment_status         present  (same migration, later statement)
--     tips.payment_transaction_id MISSING  (same migration, earlier statement)
--
--   The consequence is much wider than the TEST button. PostgreSQL raises
--   while building the trigger row reference, so every INSERT into public.tips
--   fails with: record "new" has no field "payment_transaction_id".
--   Real completed payments included. That is the failure mode where money
--   moves and no tip is ever recorded.
--
-- WHY THIS IS THE RIGHT SHAPE
--   The column is the designed link from a tip back to its payment, and the
--   trigger exists to follow it: tips, then payment_transactions, then
--   donations, so donation media (photo, donor voice) lands on the tip no
--   matter which of the four insert paths created it. Adding the column back
--   restores that path. The alternative, rewriting the trigger to tolerate the
--   column being absent, would leave real donations unable to carry media,
--   which is silent data loss rather than a loud failure.
--
-- Idempotent: pasting it twice is harmless.

-- The column and the foreign key are added as SEPARATE steps on purpose.
-- "add column if not exists ... references ..." skips the entire definition when
-- the column already exists, so a column added earlier without its foreign key
-- would keep it forever. Splitting them makes this self-healing: whichever of the
-- two is missing gets added, and a re-run changes nothing.
alter table public.tips
  add column if not exists payment_transaction_id uuid;

-- Constraint name matches what PostgreSQL would have generated for the inline
-- REFERENCES clause, so an environment where the original definition did apply
-- is left untouched rather than duplicated.
do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tips'
      and c.contype = 'f'
      and c.conkey = ARRAY[(
        select attnum from pg_attribute
         where attrelid = 'public.tips'::regclass
           and attname = 'payment_transaction_id'
      )]::smallint[]
  ) then
    alter table public.tips
      add constraint tips_payment_transaction_id_fkey
      foreign key (payment_transaction_id)
      references public.payment_transactions(id) on delete set null;
  end if;
end
$migration$;

-- The original migration declared this column UNIQUE: one tip per payment
-- transaction. Held back until the column and its foreign key are confirmed in
-- place. Applied conditionally rather than inline, because "add column if not
-- exists" skips the whole definition on a second run, constraint included, and
-- re-adding an inline constraint to an existing column fails.
--
-- The constraint name is the one PostgreSQL generates for an inline UNIQUE, so
-- it cannot collide with an environment where the original applied.
do $migration$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'tips'
      and i.indisunique
      and pg_get_indexdef(i.indexid) like '%payment_transaction_id%'
  ) then
    alter table public.tips
      add constraint tips_payment_transaction_id_key
      unique (payment_transaction_id);
  end if;
end
$migration$;

-- ---------------------------------------------------------------------------
-- VERIFY: expect three rows back.
--
--   select column_name
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'tips'
--      and column_name in
--        ('payment_transaction_id', 'payment_method', 'payment_status');
--
-- Then re-run the dashboard TEST alert. It should reach the overlay instead of
-- answering: Test failed: record "new" has no field "payment_transaction_id".
--
-- ---------------------------------------------------------------------------
-- FOLLOW-UP, deliberately NOT done here
--
--   This drift was invisible until an alert was fired. Two cheaper guards are
--   worth considering separately:
--     1. Make the trigger defensive, testing to_jsonb(new) for the key, so a
--        missing column degrades to "no media copied" rather than "no tips".
--     2. Audit every column the application writes to, once. Migrations here are
--        pasted by hand and the live database is the only authority on what
--        actually exists; probing would have caught this and the earlier
--        voice_clones owner_id drift.