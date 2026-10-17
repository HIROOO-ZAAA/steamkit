# Database migrations

50 files in `supabase/migrations/`, plus one master schema at the repo root.

## The one rule

**A file in `supabase/migrations/` proves nothing about the database.** Nothing
runs these automatically. The Supabase CLI is not installed and the project is
not linked (`supabase/.temp` has no `project-ref`), so every file is pasted by
hand into Supabase Dashboard -> SQL Editor.

That is why the same class of bug has appeared repeatedly. Each of these shipped
in a migration file, was read by a person, looked correct, and was only found
when something broke:

| What | Consequence |
|---|---|
| `20261019000000_profiles_identity_columns.sql` read `profiles.full_name`, a column no file creates | `42701`, and because a failed migration is a transaction that rolls back, it aborted the paste **and every migration after it** |
| `20261019000011_voice_clones_provider_swap.sql` built an RLS policy and a trigger on `voice_clones.user_id` after three earlier files renamed that column to `owner_id` | `42703` on every statement touching the table, forever, and no later file repaired it |
| `20261001160000_telegram_device_linking.sql` indexed one column while its `ON CONFLICT` named two | `42P10` at the moment a payment notification was claimed |
| `20261010000005` and `...007` ran `delete from public.tips` inside a `SECURITY DEFINER` function granted to `authenticated` | any signed-in user could permanently erase every tip on their account, including paid ones |

## Check before you paste

```
npm run verify:migrations
```

Static analysis over the whole set. It fails on:

- an `UPDATE`, policy or trigger referencing a column no file creates (`42703`)
- an `ON CONFLICT` target wider or narrower than any unique index or constraint (`42P10`)
- a `DELETE` inside a function granted to a client role
- duplicate migration timestamps, which make replay order non-deterministic
- a UTF-8 BOM, or text that already looks like mojibake

It reports as **notes**, not failures: non-ASCII inside comments (31 files have
it — it survives a PowerShell paste as cp1252 garbage, worth cleaning but not
fatal), `ON CONFLICT` on `storage.*` (Supabase-managed, nothing here to check
against), and `streamkit_import_share_code()` (deliberately destructive — that
is what importing a shared profile means).

### What it cannot do

**It does not execute anything.** There is no PostgreSQL in the development
environment, so a PASS means "no defect of these classes is in the text", never
"the replay succeeds". The check skips 81 dollar-quoted blocks — every function
body and `DO` block — because those are procedural: they declare their own
variables and branch on `information_schema`. It also cannot evaluate
expressions, so a typo inside a `CASE` is invisible to it.

It is proven non-vacuous: reintroducing each of the four bugs above makes it
fail, and a consistent column rename correctly stays silent.

## Rebuilding a database from scratch

Order matters and is not obvious:

1. **`supabase_schema.sql` first.** It creates ten tables that no migration
   creates — `profiles`, `tips`, `tip_settings`, `donation_goals`, `spin_wheels`,
   `raffles`, `raffle_entries`, `subathons`, `telegram_connections`,
   `subscription_tiers`. Skip it and the replay dies at
   `20261001110000_payments_bakong_flow.sql` line 71 on `alter table public.tips`.
2. **Then every migration in filename order.** Timestamps are unique, so plain
   alphabetical sort is the intended order.
3. **Then the PostgREST cache reload** — each migration that adds a column ends
   with `select pg_notify('pgrst', 'reload schema')`.

To prove the replay for real, against a scratch database:

```sh
createdb streamkit_rebuild
psql -v ON_ERROR_STOP=1 -d streamkit_rebuild -f supabase_schema.sql
for f in supabase/migrations/*.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -d streamkit_rebuild -f "$f" || { echo "FAILED: $f"; break; }
done
```

`ON_ERROR_STOP=1` is the important flag. Without it `psql` carries on after an
error and reports success, which is exactly how a broken migration looks fine.

## Working with the live database

- Read the live schema before trusting the code. Migrations have drifted from it
  more than once.
- `CREATE OR REPLACE FUNCTION` cannot change a return type or add parameters
  (PostgreSQL `42P13`). Any function whose `RETURNS TABLE(...)` list changes needs
  an explicit `DROP FUNCTION IF EXISTS` first. A trailing default-valued
  parameter is not a substitute — it creates an ambiguous overload instead of
  replacing the old signature.
- Write files as ASCII with no BOM. PowerShell here writes UTF-8 **with** a BOM
  by default, and non-ASCII has survived a paste as mojibake, turning a comment
  line into a parser error.
- Idempotent is good, but a file that repairs drift is not idempotent by nature.
  Several here are written to be safe in three divergent live states; read the
  header before pasting one you have not seen.