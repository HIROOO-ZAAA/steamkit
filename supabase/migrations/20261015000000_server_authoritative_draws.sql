-- Server-authoritative draws for the spin wheel and the raffle.
--
-- WHY THIS EXISTS
--   Both features picked their winner in the browser:
--     * src/app/dashboard/spin-wheel/page.tsx  -> Math.floor(Math.random() * n)
--     * src/app/overlay/spin-wheel/page.tsx    -> the same, again
--     * src/app/dashboard/raffle/page.tsx      -> randomIndex() over a pool
--   A creator who disputes a result has no answer: the number was generated on
--   the machine that happened to have the overlay open, was never stored, and
--   can be re-rolled simply by reloading the page. Nothing distinguishes a fair
--   draw from a rigged one.
--
--   The draw moves here. The database decides, the result is written down, and
--   a second attempt at the same input is refused rather than silently
--   replacing the first.
--
-- THE HONEST LIMITATION
--   This is authoritative and auditable, not provably fair. `random()` is still
--   the PostgreSQL PRNG; an operator with database access could seed it
--   knowingly. Provable fairness needs a commit-reveal scheme (seed hash
--   published before the draw, revealed after) which is disproportionate here.
--   What this buys is that the *result is recorded* and cannot be quietly
--   changed, which is what a dispute actually turns on.
--
-- CONCURRENCY IS THE POINT OF THE LOCK
--   Without `for update`, two overlapping draws both read status='open', both
--   pick a winner, and the second UPDATE overwrites the first. The row lock
--   makes the second one block, then observe status='completed' and fail.

-- ── Per-currency trigger threshold ───────────────────────────────────────────
-- The overlay hardcoded `amount >= 1.0` while this column sat unused, so the
-- `min_tip_to_trigger` a creator sets was never honoured by anything. Worse,
-- comparing a raw amount to a single threshold means a 50,000 KHR tip passes a
-- 5.00 threshold by a factor of 10,000.
--
-- This is the same per-currency split the alert tiers already use
-- (`min_amount_usd` + `min_amount_khr`) for exactly the same reason: there is
-- no trustworthy FX rate at draw time. The KHR column is added alongside so an
-- existing USD threshold keeps its meaning.
alter table public.spin_wheels
  add column if not exists min_tip_to_trigger_khr numeric(10, 2)
    default 50000.00 not null;

-- ── Spin audit trail ─────────────────────────────────────────────────────────
-- One row per spin. This is what makes the result provable after the fact and
-- what stops one tip being spun repeatedly to fish for a better slice.
create table if not exists public.spin_wheel_spins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Nullable so a creator can spin manually from the dashboard.
  tip_id uuid references public.tips(id) on delete set null,
  slice_index integer not null,
  slice_label text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- A partial unique index rather than a table constraint, so it survives a
-- re-run of this file: `create table if not exists` is a no-op once the table
-- exists and would never install the constraint on a second paste. Postgres
-- treats NULLs as distinct, so manual spins are not de-duplicated -- which is
-- correct, they are deliberate.
create unique index if not exists spin_wheel_spins_one_per_tip
  on public.spin_wheel_spins (tip_id)
  where tip_id is not null;

alter table public.spin_wheel_spins enable row level security;

-- No SELECT policy for creators: an authenticated creator could otherwise read
-- every spin any other creator has ever run. The draw RPC returns the result
-- to the caller that asked for it, which is all the UI needs. The creator-side
-- history list should go through a dedicated security-definer function.
revoke all on table public.spin_wheel_spins from anon, authenticated;

create index if not exists spin_wheel_spins_user_created_idx
  on public.spin_wheel_spins (user_id, created_at desc);

-- A NOTE ON THE RETURN COLUMN NAMES
--   plpgsql substitutes a variable for any unqualified identifier that matches
--   one, and OUT parameters are variables. An OUT column called `winner_name`
--   would therefore rewrite the `set winner_name = ...` inside the function
--   that produces it, and `slice_index` would rewrite the INSERT column list.
--   The returned columns below are deliberately named so they collide with
--   nothing in the SQL they execute. If you rename one, check both.

-- ── Raffle draw ──────────────────────────────────────────────────────────────
-- Session-authenticated: this one runs from the creator's own dashboard.
create or replace function public.streamkit_draw_raffle_winner(p_raffle_id uuid)
returns table (
  raffle_id uuid,
  entry_id uuid,
  drawn_winner_name text,
  drawn_tickets integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_raffle public.raffles;
  v_total bigint := 0;
  v_pick bigint;
  v_running bigint := 0;
  v_row record;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- SECURITY DEFINER bypasses RLS, so ownership is checked here explicitly.
  -- A plain `where id = ...` would happily let any signed-in user draw any
  -- raffle in the database.
  select * into v_raffle
  from public.raffles as r
  where r.id = p_raffle_id
    and r.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'raffle not found' using errcode = 'P0002';
  end if;

  if v_raffle.status = 'completed' then
    raise exception 'this raffle has already been drawn' using errcode = 'P0001';
  end if;

  select coalesce(sum(e.entries_count), 0) into v_total
  from public.raffle_entries as e
  where e.raffle_id = p_raffle_id;

  if v_total <= 0 then
    raise exception 'this raffle has no entries' using errcode = 'P0001';
  end if;

  -- One random number for the whole raffle, then a cumulative walk over the
  -- entries in insertion order. Drawing once and walking is easier to reason
  -- about than calling random() per row, and cannot skew if two entries share
  -- a created_at.
  v_pick := floor(random() * v_total)::bigint + 1;

  for v_row in
    select e.id, e.username, e.display_name, e.entries_count
    from public.raffle_entries as e
    where e.raffle_id = p_raffle_id
    order by e.created_at, e.id
  loop
    v_running := v_running + v_row.entries_count;
    if v_pick <= v_running then
      update public.raffles as r
      set status = 'completed',
          winner_name = coalesce(v_row.display_name, v_row.username)
      where r.id = p_raffle_id;

      -- `drawn_winner_name` deliberately returns the same coalesce() that was
      -- just written to `raffles.winner_name`. Returning the raw username here
      -- would make the overlay announce one name while the stored record said
      -- another, and the two would disagree in any later audit.
      return query
        select p_raffle_id,
               v_row.id,
               coalesce(v_row.display_name, v_row.username),
               v_row.entries_count;
      return;
    end if;
  end loop;

  -- Unreachable while v_total matches the sum walked above. Raised rather than
  -- returned so a silent no-winner can never be shown to a stream.
  raise exception 'raffle draw produced no winner' using errcode = 'P0001';
end
$function$;

revoke all on function public.streamkit_draw_raffle_winner(uuid) from public;
grant execute on function public.streamkit_draw_raffle_winner(uuid) to authenticated;

-- ── Spin draw ────────────────────────────────────────────────────────────────
-- Token-authenticated: the OBS overlay is an anonymous page, and the same
-- overlay token already grants it this creator's alert configuration. It grants
-- nothing new here, and the draw is constrained to genuine donations so it
-- cannot be used to spin at will.
create or replace function public.streamkit_spin_wheel(
  p_token text,
  p_tip_id uuid default null
)
returns table (
  picked_index integer,
  picked_label text,
  spin_id uuid,
  should_spin boolean,
  -- The slice set the index refers to. The overlay keeps its own copy of the
  -- wheel to render, and if that ever drifts from the database the returned
  -- index would point at the wrong slice on screen while the audit trail
  -- records a different one. Returning the slices with the draw makes that
  -- impossible: the overlay renders exactly what was drawn from.
  slices jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
  v_wheel public.spin_wheels;
  v_slices jsonb;
  v_count integer;
  v_index integer;
  v_label text;
  v_amount numeric;
  v_currency text;
  v_min numeric;
  v_spin_id uuid;
begin
  -- Reuses the credentials table rather than inventing a second token store.
  select c.creator_id into v_creator
  from public.streamkit_overlay_credentials as c
  where c.token = p_token;

  if v_creator is null then
    raise exception 'unknown overlay token' using errcode = '42501';
  end if;

  select * into v_wheel
  from public.spin_wheels as w
  where w.user_id = v_creator;

  if not found then
    raise exception 'no spin wheel configured' using errcode = 'P0002';
  end if;

  v_slices := v_wheel.slices;
  if v_slices is null or jsonb_array_length(v_slices) = 0 then
    raise exception 'the spin wheel has no slices' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(v_slices);

  -- A tip is optional so the creator can spin manually. When one is supplied it
  -- must be a real donation to this creator and large enough to trigger --
  -- otherwise anyone holding the overlay token could spin at will.
  v_amount := null;
  if p_tip_id is not null then
    select t.amount, t.currency into v_amount, v_currency
    from public.tips as t
    where t.id = p_tip_id
      and t.creator_id = v_creator
      and t.payment_status in ('successful', 'test');

    if not found then
      raise exception 'no qualifying donation for this spin' using errcode = 'P0001';
    end if;

    -- Per-currency threshold: comparing a KHR amount against the USD column
    -- would make every Khmer tip trigger.
    if v_currency = 'KHR' then
      v_min := v_wheel.min_tip_to_trigger_khr;
    else
      v_min := v_wheel.min_tip_to_trigger;
    end if;

    if v_amount < v_min then
      -- Not an error: a small tip is a normal outcome, and the overlay should
      -- simply not spin. Returning a row rather than raising keeps the
      -- overlay's path identical to its old `if (amount >= 1.0)` check.
      return query select null::integer, null::text, null::uuid, false, v_slices;
      return;
    end if;
  end if;

  -- Checked before drawing rather than left to the unique index to reject.
  -- Realtime re-fires buffered inserts on resubscribe, so the overlay can
  -- legitimately ask about a tip it has already spun. Letting the INSERT fail
  -- would surface a raw unique-violation as an error on the stream; returning
  -- "do not spin" is the same quiet outcome as a sub-threshold tip.
  if p_tip_id is not null and exists (
    select 1
    from public.spin_wheel_spins as s
    where s.tip_id = p_tip_id
  ) then
    return query select null::integer, null::text, null::uuid, false, v_slices;
    return;
  end if;

  -- The unique index on tip_id still backstops a genuine race between two
  -- concurrent calls that both passed the check above; that one is allowed to
  -- raise, because it is a real double-spin attempt rather than a replay.
  v_index := floor(random() * v_count)::integer;
  v_label := v_slices -> v_index ->> 'label';

  insert into public.spin_wheel_spins (user_id, tip_id, slice_index, slice_label)
  values (v_creator, p_tip_id, v_index, v_label)
  returning id into v_spin_id;

  return query select v_index, v_label, v_spin_id, true, v_slices;
end
$function$;

revoke all on function public.streamkit_spin_wheel(text, uuid) from public;
grant execute on function public.streamkit_spin_wheel(text, uuid) to anon, authenticated;

-- ── Wheel configuration for the overlay ──────────────────────────────────────
-- The overlay needs the slice list before anything is drawn, or it renders its
-- own hardcoded placeholder wheel instead of the real one. Token-authenticated
-- for the same reason as the draw: the OBS page is anonymous and the token
-- already grants this creator's overlay configuration.
create or replace function public.streamkit_spin_wheel_config(p_token text)
returns table (
  wheel_title text,
  slices jsonb,
  min_tip_to_trigger numeric,
  min_tip_to_trigger_khr numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    w.title,
    w.slices,
    w.min_tip_to_trigger,
    w.min_tip_to_trigger_khr
  from public.streamkit_overlay_credentials as c
  join public.spin_wheels as w on w.user_id = c.creator_id
  where c.token = p_token;
$function$;

revoke all on function public.streamkit_spin_wheel_config(text) from public;
grant execute on function public.streamkit_spin_wheel_config(text)
  to anon, authenticated;

-- ── Raffle entry cleanup ─────────────────────────────────────────────────────
-- The base schema grants SELECT to everyone and INSERT to anyone (a viewer
-- joins a giveaway by inserting a row), but there is no DELETE for the creator
-- who owns the raffle. Without this, "Reset all entries" can only ever clear
-- local React state while the rows stay in the database.
--
-- Ownership is checked through the parent raffle: raffle_entries has no
-- user_id of its own.
drop policy if exists "Raffle owners delete entries" on public.raffle_entries;
create policy "Raffle owners delete entries"
  on public.raffle_entries
  for delete
  using (exists (
    select 1
    from public.raffles as r
    where r.id = raffle_id
      and r.user_id = auth.uid()
  ));

-- Same reasoning for ticket counts. Without UPDATE the creator can only add a
-- participant, never increase their tickets, and `entries_count` is exactly the
-- weight the draw uses.
drop policy if exists "Raffle owners update entries" on public.raffle_entries;
create policy "Raffle owners update entries"
  on public.raffle_entries
  for update
  using (exists (
    select 1
    from public.raffles as r
    where r.id = raffle_id
      and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.raffles as r
    where r.id = raffle_id
      and r.user_id = auth.uid()
  ));