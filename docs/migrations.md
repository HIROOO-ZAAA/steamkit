# Database migrations

72 SQL migration files in `supabase/migrations/` as counted on 2026-11-19, plus
one master schema at the repo root. Recount this as migrations are added.

## The one rule

**A file in `supabase/migrations/` proves nothing about the database.** Nothing
runs these automatically. This checkout contains a local CLI entry at
`node_modules/.bin/supabase` and a project-ref marker at
`supabase/.temp/project-ref`; `AGENTS.md` currently says the CLI is not
installed or linked. This local-state conflict is unresolved. File presence
does not prove authenticated access or which migrations reached the live
database. Verify the intended project and inspect migration status read-only
before preparing SQL; apply reviewed migrations by hand only after confirming
the target and pending state.

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

This bootstrap file is for an empty database only. **Do not rerun
`supabase_schema.sql` against an existing or already-migrated project.** Its
function definitions are the initial schema and can be older than the versions
installed by later migrations. For example, `streamkit_resolve_overlay(text)`
has gained return columns over time; PostgreSQL rejects changing its table
return type with `42P13`. Do not resolve that by dropping the live function and
leaving the bootstrap definition in place, because the current overlay needs
the migrated return shape. Check the live migration state and apply only the
reviewed pending migration(s) in order.

## Diagnosing SQL editor errors

- `42P13` for `streamkit_resolve_overlay(text)` usually means the bootstrap
  schema was rerun after later migrations changed its return columns. Check the
  target project and migration state; do not drop the live function and leave
  the older bootstrap definition in place. Migration
  `20261019000013_alerts_tts_volume.sql` contains the current evolved function.
- `42P01` for `public.telegram_aba_notifications` means the table is absent in
  the project receiving the query. Migration
  `20261001200000_telegram_local_listener.sql` creates it; verify the target
  project and whether that migration ran before applying anything.
- `42703` for `i.indexid` is a typo in a catalog query: `pg_index` uses
  `indexrelid`. The checked-in payment migration uses that column.
- `42883` for `pg_catalog.greatest(...)` comes from qualifying `GREATEST` as a
  function. Use `greatest(...)` unqualified; the checked-in SQL already does.

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
