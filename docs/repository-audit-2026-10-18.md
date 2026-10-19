# StreamKit Repository Audit — 2026-10-18

## Executive summary

StreamKit is a Next.js 16 / React 19 creator dashboard backed by Supabase, with ABA/Bakong payment flows, a local Telegram bridge, a VoiceStudio TTS route, and OBS browser-source overlays. The repository has useful unit coverage and an explicit read-only CI workflow. The current working tree also contains user work in progress; it was preserved.

The main confirmed product gap is that **PayPal is not implemented**: there is no PayPal provider, webhook, or event adapter in the checked-in application code. The main unresolved operational issue is the reported silent OBS audio. The overlay has clone synthesis and browser audio playback code, but there was no fresh authenticated test or OBS playback available in this audit, so audible success is unverified.

The most important data-access concern is a broad `tips` SELECT policy in the checked-in schema. The repository does not establish the live database's table grants or effective RLS, so treat exposure as a high-priority **live configuration hypothesis**, not a verified production breach. Reconcile it read-only before changing policy: overlay Realtime may currently depend on tip visibility.

During Phase 2, I found and fixed a TEST-only duplicate-speech path: the dashboard and OBS overlay both requested speech for the same accepted test. The overlay now owns speech for an OBS test; the dashboard keeps its visual preview. No database, payment, PM2 process, OBS source, or live service was changed.

## Architecture map

| Area | Responsibility | Main files |
|---|---|---|
| Web app and auth | Next.js App Router pages, Supabase session proxy, creator dashboard | `src/app/`, `src/proxy.ts`, `src/lib/supabase/` |
| Payments | Payment request creation, ABA callback verification, Bakong status verification, payment transaction completion | `src/app/api/payments/`, `src/lib/payments/`, `supabase/migrations/20261001110000_payments_bakong_flow.sql`, `20261001130000_payments_aba_payway.sql` |
| Telegram/ABA listener | Local Teleproto client, ABA notice parser, RPC ingestion, dashboard bridge control | `scripts/kit-client-bridge.mjs`, `scripts/telegram-local-listener.mjs`, `scripts/aba-message-parser.mjs`, `src/app/dashboard/kit-client/page.tsx` |
| TTS and voice clones | Saved clone lookup, VoiceStudio request, audio validation/cache, creator voice settings | `src/app/api/tts/synthesize/route.ts`, `src/lib/voice/`, `src/app/dashboard/voice-settings/` |
| Alert overlay | Resolve private overlay config, receive/poll eligible tips, claim once, render alert, build speech, queue/play audio | `src/app/overlay/alerts/page.tsx`, `src/lib/overlay/`, `src/app/api/overlay/claim-alert/route.ts` |
| Database | Schema snapshot and hand-applied SQL migrations | `supabase_schema.sql`, `supabase/migrations/` |
| Operations | PM2 process declarations for bridge, Next.js, VoiceStudio and Cloudflare tunnel | `ecosystem.config.js` |
| Quality checks | GitHub Actions install, static migration scan, lint, unit tests, build | `.github/workflows/ci.yml`, `package.json`, `scripts/verify-migrations.mjs`, `tests/` |

## Git and CI status

- Branch: `main`.
- HEAD: `39de6223f16fe49d59e356dcbfc31f789ac0ef34` (`ci: add StreamKit Actions workflow`, 2026-10-18).
- Local tracking display: `main...origin/main`; no fetch was performed, so this is not a fresh remote comparison.
- Existing uncommitted entries preserved: `scripts/kit-client-bridge.mjs`, `src/app/dashboard/kit-client/page.tsx`, `scripts/bridge-access-policy.mjs`, `scripts/bridge-listener-resume.mjs`, `supabase/migrations/20261021000002_telegram_groups_drop_session_data.sql`, `tests/bridge-access-policy.test.ts`, `tests/bridge-http.test.ts`, and `tests/bridge-listener-resume.test.ts`.
- GitHub Actions result for this commit: **unavailable**. `gh run list` could not connect to `api.github.com`; the web endpoint did not return the run list.
- CI definition uses Node 22, `npm ci`, migration verification, lint, tests, and a dummy-environment build. Local verification used Node 25.0.0 and npm 11.15.0.

## Confirmed issues and risks

| Issue | Severity | Evidence | Status | Verification |
|---|---|---|---|---|
| PayPal donations have no in-repository ingestion path | Medium / product blocker | `PaymentProviderName` contains placeholder, Bakong, ABA PayWay, and custom; provider factory has no PayPal; no PayPal source/webhook exists in app, scripts, migrations, or tests | Open | Repository search; no integration test exists |
| OBS audio is reported silent, but current physical output is not verified | High user impact | Overlay includes TTS request, audio URL validation, Web Audio/element playback, and queue diagnostics. This audit could not authenticate to the dashboard or access OBS. Old logs are not a fresh test and include cached audio | Blocked | Needs one authenticated synthetic alert, one active overlay, OBS source meter/capture and human listening confirmation |
| `tips` broad SELECT policy may expose donor details | High if anonymous SELECT is granted | `supabase_schema.sql` defines `Tips viewable by all` with `USING (true)`; tips contain donor name, amount, currency, message, and payment status. The reviewed migration set drops the public INSERT policy but no reviewed file narrows this SELECT policy. Actual live grants/RLS were not inspected | Open / live state unverified | Read-only live check of `information_schema` grants and `pg_policies`, followed by design for a scoped overlay event feed before policy changes |
| Telegram `session_data` schema conflict remains unresolved | Medium | Migration `20261005000000_telegram_group_session_columns.sql` adds the column; latest dashboard code no longer writes it; the pending `20261021000002_telegram_groups_drop_session_data.sql` says an earlier PostgREST probe returned 42703 but cannot explain how it disappeared | Blocked | Compare live column, constraints, triggers, and functions read-only. The pending migration was neither run nor edited |
| Build could not be verified in the isolated copy | Medium / release uncertainty | `next build` began but produced no further output for over three minutes; only the isolated build process was interrupted | Open | Retry in a suitable isolated environment and capture completion/failure |
| Hosted CI status could not be retrieved | Low / release uncertainty | GitHub API connection failed and Actions page was not available through the browser search path | Blocked | Check the Actions page or rerun CI when connectivity is available |

No new code bug was proven sufficiently to justify editing application behavior during this audit. The user’s in-progress Telegram changes were not treated as mine to rewrite.

## Security and data-integrity review

### Payments

- ABA webhook code verifies the PayWay callback, then independently calls the transaction-check endpoint and compares verified amount, currency, and provider time against the stored intent before invoking the completion RPC.
- The ABA completion RPC locks the payment row and prevents already-terminal payments from creating a second tip. Tip/payment transaction uniqueness provides an additional idempotency boundary.
- Payment creation accepts supported USD/KHR values and server-side code owns the provider configuration. No real payment or production write was attempted.
- PayPal and Stripe are not implemented despite a Stripe placeholder in `.env.example`. Do not add payment secrets or accept client-declared success as a substitute for provider verification.

### Supabase and schema

- Migration verification passes static checks, but does not execute SQL or prove the live schema.
- The checked-in schema has a broad public tip read policy. Confirm both table privileges and effective RLS on the live project before asserting exposure or applying a restriction.
- The Telegram `session_data` discrepancy is not safe to resolve from the repository alone. Keep `20261021000002_telegram_groups_drop_session_data.sql` untouched until the live catalog and dependent routines are reconciled.
- The migration guide says migrations are applied manually. No migration was run.

### Telegram bridge

- The in-progress bridge code binds to `127.0.0.1`, applies an Origin allowlist plus a required custom header, and has tests for foreign-origin rejection. This protects against hostile web pages; it is not authentication against other local processes. The bridge comments document this boundary.
- Listener startup uses a guard for concurrent/repeated start calls and resume behavior. Tests exercise duplicate-handler prevention, partial failure cleanup, reset races, and safe resume failure.
- HTTP bridge tests need loopback sockets. The sandbox-denied first run was retried with permission for local loopback only; all tests passed. No bridge service was started.
- No end-to-end Telegram notification was replayed, so parser compatibility with a current real ABA notification remains unverified.

### TTS and OBS

- The overlay reads the saved clone configuration and formats the acknowledgement before the message. Unit tests cover full-message retention, currency speech, chunking, clone selection, and alert claims.
- Code-level playback events do not prove OBS stream output or local monitoring. A Browser Source can feed the OBS mixer while local monitoring is disabled; verify **Edit → Advanced Audio Properties** for the StreamKit source and the configured **Monitoring Device** in OBS Audio settings. Choose Monitor and Output only if local monitoring is desired and echo routing is understood.
- No current OBS instance, authenticated dashboard session, or fresh unique test event was available. The cloned voice was not claimed audible.
- The cloned voice selection was not modified. No donor text or payment amount was printed into the report.

## Quality checks

Checks ran against an isolated copy of the current working tree. Local secrets, `.git`, generated output, and the Telegram session/config files were excluded; dependencies were installed from the lockfile in the copy.

| Check | Result | Details |
|---|---|---|
| `npm ci` | Pass, exit 0 | Installed 432 packages; npm reported deprecated `crypto-js@4.2.0` and ESLint 9.39.5 |
| `npm test` | Pass, exit 0 | 192 tests, 37 suites, 0 failures. Initial run could not bind loopback due sandbox; local-only socket retry passed |
| `npm run lint` | Pass, exit 0 | 0 errors, 50 warnings; warnings include unused imports/values, `<img>` guidance, and effect dependencies |
| `npx tsc --noEmit` | Pass, exit 0 | No TypeScript diagnostics |
| `npm run verify:migrations` | Pass, exit 0 | 45 migrations; 35 non-failure notes; static check explicitly does not prove database execution |
| `git diff --check` | Pass, exit 0 | Only Git LF→CRLF notices on existing modified files |
| `npm run build` | Incomplete | Isolated `next build` started then stalled at “Creating an optimized production build” for over three minutes; the isolated command was stopped, not a live service |
| `npm audit --omit=dev` | Blocked | npm registry DNS was unavailable (`ENOTFOUND registry.npmjs.org`) |

## Telegram session-data reconciliation plan

1. Do not run the pending migration.
2. In the Supabase SQL editor, read `information_schema.columns` for `public.telegram_groups.session_data` and read `pg_policies`, `pg_trigger`, and `pg_proc` references without modifying anything.
3. Compare the result with migrations `20261001180000_telegram_group_linking.sql` and `20261005000000_telegram_group_session_columns.sql`, and with current application queries. Do not select or print the Telegram session value itself.
4. If the column is absent and no dependent database object references it, mark the pending drop migration unnecessary rather than using it as a no-op. If present, confirm the dashboard no longer writes it and no old consumer reads it before preparing a reviewed drop.
5. Only after the user reviews the evidence should a migration be chosen and applied manually.

## Prioritized roadmap

| Priority | Feature / fix | User problem and scope | Database/security impact | Acceptance criteria and tests |
|---|---|---|---|---|
| A1 | Reconcile public tip read access | Ensure donor messages and payment fields are not unnecessarily exposed while overlays still receive alerts | Read live privileges/RLS first; likely requires a least-privilege event feed/RPC or scoped realtime policy. Do not apply a blanket revoke until overlay flow is replaced/verified | Anonymous direct tip query cannot read private rows; creator dashboard and token-authorized overlay receive only required fields; RLS and realtime tests pass |
| A2 | End-to-end OBS audio diagnostic | Show whether audio left TTS, decoded, entered the Browser Source, and reached monitoring/stream output | No schema change needed; diagnostics must omit signed URLs, tokens, donor content | One synthetic unique alert with one overlay; verify selected clone audio response, browser playback, OBS mixer/source, recording/stream output, and a human hearing local monitor if requested |
| A3 | Stable VoiceStudio operations | Quick Cloudflare tunnel URL changes across restarts and is unsuitable for a pinned remote base URL | No schema change; protect VoiceStudio with shared secret and a stable named tunnel hostname | Restart/recovery keeps configured host valid; health and synthesis checks work without exposing the secret |
| B1 | PayPal provider integration (only if PayPal is the desired source) | Ingest confirmed PayPal donations into the same verified alert path | Requires a supported PayPal API/webhook contract, stored credentials, signature verification, transaction idempotency, schema/provider enum updates, and no browser-trusted success | Sandbox webhook fixture creates one pending-to-successful transition; duplicate/invalid callbacks create no alert; one overlay alert reads name/amount/message |
| B2 | Creator alert history and queue status | Help creators see whether events are waiting, deduped, spoken, or failed | Consider a minimal event status table only if logs cannot meet retention needs; protect donor text and owner access | Searchable status with IDs/stages, redacted diagnostics, pagination, retention policy, and tests |
| C1 | Overlay connection/audio setup wizard | Reduce incorrect Browser Source URL and audio monitoring configuration | No database change beyond current overlay settings | UI confirms one overlay connection, browser-source audio capture, and desired monitor/output routing with clear failure states |

## Changes and remaining blockers

- Initial audit added this report. Phase 2 also changed `src/app/dashboard/alerts/page.tsx`, `src/lib/overlay/alert-logic.ts`, and `tests/alert-logic.test.ts` to prevent dashboard speech from duplicating an OBS test.
- Existing user changes were preserved. No migration was modified or applied; no production database, payment provider, PM2 service, Next server, VoiceStudio, OBS, Telegram bridge, or tunnel was started/restarted/stopped.
- No real-payment TTS, PayPal, RLS, or migration fix is marked complete because each needs live, provider-contract, or audible-playback evidence that is unavailable here.

## Next action

Safest next action: perform a **read-only** Supabase catalog check for `tips` SELECT grants/policies and `telegram_groups.session_data`, then run one unique synthetic alert with an authenticated dashboard and one active OBS Browser Source while recording the source meter and stream output. No real donation is needed.

## Phase 2 — 2026-10-18

### Git state and preserved work

- Branch and HEAD are unchanged: `main`, `39de6223f16fe49d59e356dcbfc31f789ac0ef34`.
- Preserved the eight existing uncommitted entries listed above, including the pending migration `20261021000002_telegram_groups_drop_session_data.sql`. That migration was not opened for execution, edited, or applied.
- Phase 2 changes are limited to `src/app/dashboard/alerts/page.tsx`, `src/lib/overlay/alert-logic.ts`, `tests/alert-logic.test.ts`, plus this report.

### Supabase read-only access and findings

- No Supabase CLI, `psql`, linked Supabase project ref, SQL MCP connector, or process-level Supabase/database variables were available. `.env.local` exists but was not read. I therefore did not query the live database or migration history.
- Repository references to `telegram_groups.session_data`: migration `20261005000000_telegram_group_session_columns.sql` adds the column; current dashboard upsert does not write it; no current application query selects it. The pending drop migration describes a previous PostgREST `42703` observation, but this checkout cannot verify whether the live column is absent or which migration ran. Some uncommitted bridge-policy comments still describe the old database write; those comments do not match the current dashboard code and were left untouched.
- Migration review found a permission widening to verify: `20261001180000_telegram_group_linking.sql` revokes table access and grants limited select columns; `20261003000000_telegram_group_write_policies.sql` adds limited write columns; then `20261005000000_telegram_group_session_columns.sql` adds `session_data` and grants table-wide SELECT/INSERT/UPDATE/DELETE to `authenticated`. Its owner-only RLS policy still limits rows to the signed-in creator, but if this migration ran and the column exists, that creator's JWT can read the plaintext session in their own row. Current application code no longer selects or writes it. The live column, prior stored values, grants, and migration rows remain unknown.
- `supabase_schema.sql` enables RLS on `tips` and defines `Tips viewable by all` with `USING (true)`. The table includes donor name, amount, currency, message, and payment status. The public creator profile also queries `tips.select('*')` filtered to one creator for its leaderboard. If `anon` has `SELECT`, the policy permits reading every tip row and the REST API can request columns beyond that UI filter. The token-scoped `SECURITY DEFINER` recent-alert function is narrower, but the overlay also subscribes directly to `tips` Realtime. Live grants, policies, and effective behavior remain unverified; no production exposure is asserted.
- An authorized administrator can run the following read-only catalog queries and return only their results. They do not select Telegram session contents or donor rows:

```sql
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'tips';

select role_name,
       has_table_privilege(role_name::name, 'public.tips', 'SELECT') as can_select_tips
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'tips';

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'telegram_groups'
order by ordinal_position;

select role_name,
       has_table_privilege(role_name::name, 'public.telegram_groups', 'SELECT') as table_select,
       has_table_privilege(role_name::name, 'public.telegram_groups', 'INSERT') as table_insert,
       has_table_privilege(role_name::name, 'public.telegram_groups', 'UPDATE') as table_update,
       has_table_privilege(role_name::name, 'public.telegram_groups', 'DELETE') as table_delete
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

select r.role_name, c.column_name,
       has_column_privilege(r.role_name::name, 'public.telegram_groups', c.column_name, 'SELECT') as can_select,
       has_column_privilege(r.role_name::name, 'public.telegram_groups', c.column_name, 'INSERT') as can_insert,
       has_column_privilege(r.role_name::name, 'public.telegram_groups', c.column_name, 'UPDATE') as can_update
from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
cross join information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'telegram_groups'
  and c.column_name in ('id', 'creator_id', 'telegram_chat_id', 'group_id', 'group_title', 'is_active', 'status', 'last_seen_at', 'session_data')
order by r.role_name, c.column_name;

select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'telegram_groups';

select exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'telegram_groups'
    and column_name = 'session_data'
) as session_data_column_exists;

select n.nspname as schema_name, p.proname as function_name
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where p.prokind in ('f', 'p')
  and pg_get_functiondef(p.oid) ilike '%session_data%';

select version, name
from supabase_migrations.schema_migrations
where version in ('20261001180000', '20261003000000', '20261005000000', '20261021000002')
order by version;
```

The application's current authenticated `telegram_groups` paths require read access for `creator_id`, `is_active`, `group_title`, `group_id`, `id`, `telegram_chat_id`, and `status`; the dashboard upsert writes `creator_id`, `group_id`, `group_title`, and `is_active`, and logout updates `is_active`. Server-side Telegram notifications use the service-role client to select `id`/`status` and update `last_seen_at`. Compare those needs to the returned column grants; broad authenticated table grants are not required by the current client code. Reconcile migration rows with the live column result before deciding whether the pending drop migration is relevant. If `anon` can select `tips`, design and verify a token-scoped Realtime feed before tightening access; do not simply revoke SELECT while the overlay subscribes directly to the table.

Safe remediation if live results confirm `session_data` exists: first confirm no deployed code or database routine still consumes it and preserve any required recovery data securely; then prepare a reviewed migration to remove the unused credential column and replace the broad authenticated table grants with only the columns the dashboard needs. Do not run the pending migration as-is until the live schema and migration history explain its `42703` report. If live results confirm anonymous SELECT on `tips`, plan an owner-scoped dashboard query and token-authenticated overlay feed before replacing the public SELECT policy; review public profile leaderboard behavior separately so it exposes only intended display fields.

### Alert/TTS/OBS trace

1. `/api/alerts/test` inserts a `test` tip through `streamkit_insert_test_tip`; it does not synthesize speech.
2. The overlay receives tips through Realtime and a 3-second polling path. It de-duplicates locally, refreshes saved settings, then calls `/api/overlay/claim-alert`. The claim route resolves the overlay token, checks creator ownership and successful/test status, and atomically updates `played_in_overlay=false` to `true` before playback.
3. The overlay builds the configured acknowledgement followed by the viewer message, calls `/api/tts/synthesize` with the existing overlay token, resolves the saved clone, and logs synthesis plus browser playback stages. Browser playback tries Web Audio and has bounded audio-element fallback. `playback=ended` is not proof that a listener heard it.
4. The TEST button also used to call `playPreviewSpeech` in the dashboard immediately after the server accepted the same test tip. The overlay independently synthesized that tip. This was a confirmed duplicate TTS dispatch in the code path and could contend for VoiceStudio's single GPU worker. I changed the accepted-OBS-test path so dashboard preview stays visual while the overlay owns speech. Donor → amount → message construction and saved clone resolution are unchanged.
5. The React overlay effect removes its Realtime channel and clears its polling timers on unmount; cross-instance database claiming prevents a second overlay from claiming the same tip when the claim schema is present. Repository code cannot establish how many Browser Sources are currently active.
6. At inspection time no OBS process and no port-3000 listener were present. No active overlay, OBS audio meter, stream output, or local monitoring route could be inspected. Audible playback remains unverified.

Minimal future test, without payment: with the app and one OBS Browser Source already active, click TEST once using a unique message. Confirm exactly one payment/test ID reaches `speech_built`, one claim succeeds, one `/api/tts/synthesize` dispatch returns audio from the selected clone, and one browser playback starts. Then separately confirm (a) source meter activity, (b) a short OBS recording contains the audio when replayed, and (c) local monitor output only after the monitoring device is configured. This separates synthesis/browser playback, OBS program output, and local monitoring.

### Build and hosted CI

- `package.json` scripts are `dev: next dev`, `build: next build`, `start: next start`, `lint: eslint`, `test: node --test "tests/**/*.test.ts"`, and `verify:migrations: node scripts/verify-migrations.mjs`.
- Re-ran `npm run build` in the isolated `streamkit-audit-39de622` copy with the CI workflow's dummy environment. It reproduced the same stall at `Creating an optimized production build ...` for 180 seconds. `.next/diagnostics/build-diagnostics.json` records `buildStage: compile` and `useBuildWorker: true`; partial compiler chunks were written. There was no timeout or out-of-memory diagnostic. I stopped only the isolated build. Conclusion: reproducible compile-stage stall, cause unknown; available logs do not support attributing it to timeout or resource exhaustion.
- Hosted CI remains unavailable: `gh run list` again failed to connect to `api.github.com`. No success or failure status is inferred.
- The earlier npm registry audit failure (`ENOTFOUND registry.npmjs.org`) remains a connectivity blocker, separate from application/build behavior.

### Phase 2 verification

| Check | Result |
|---|---|
| New regression test | Pass: accepted OBS tests do not trigger local dashboard speech |
| Full isolated test suite | Pass: 193 tests, 37 suites, zero failures (loopback permission needed for bridge HTTP tests) |
| Isolated TypeScript | Pass: `npx tsc --noEmit` |
| Targeted isolated lint | Pass: zero errors, six existing warnings in dashboard alerts page |
| Live Supabase / OBS / audible test | Not run: no authorized database query path, OBS process, or app listener was available |
| Build | Reproduced compile-stage stall; no root cause established |

No safe database or OBS service change is indicated by the available evidence. The one isolated dashboard-versus-overlay duplicate TTS issue is fixed and regression-tested; live OBS speech is not claimed as verified.

## Goal 4 — Telegram, TTS, and OBS reliability

### Telegram event flow and deduplication

- The configured bridge in `ecosystem.config.js` is `scripts/kit-client-bridge.mjs`. It decrypts the local Telegram session file, connects the Telegram client, loads `telegram-local-agent.json`, re-registers the saved agent token hash/sender, and resumes listening. No session contents or token values were inspected or printed.
- Incoming messages are filtered by the configured chat and expected ABA bot sender. `scripts/aba-message-parser.mjs` maps a positive amount/currency and optional donor/message labels. The bridge calls `streamkit_record_parsed_aba_tip` with parser output; the database function checks agent token hash, sender, chat, and amount, then inserts one notification and one successful tip only if the `(telegram_chat_id, telegram_message_id)` unique key was new. Duplicate delivery returns `duplicate=true` before inserting a second tip.
- Synthetic parser fixtures: `node scripts/aba-message-parser.mjs --test` passed all seven fixtures in the isolated copy. There is no automated Node test file for this parser, and no representative sanitized current Telegram notification was available. The `message` regex reads the remainder of the same line after `message`, `remark`, `note`, or `memo`, capped at 300 characters; actual ABA format compatibility and complete-message extraction remain unverified.
- Recovery evidence: `kit-client-bridge.mjs` loads a locally encrypted session and uses Teleproto with `connectionRetries: 5`. On explicit invalid/revoked-session errors, it clears the local session and returns to QR login. Teleproto's installed package defaults enable automatic reconnect and set reconnect retries to unlimited; this is dependency behavior, not a live reconnect test. Saved-listener resume errors are caught without deleting the session.
- `createListenGuard` coalesces concurrent starts, makes successful repeats no-ops, allows retries after failure, detaches a partially attached handler, and invalidates a start racing logout/reset. Existing tests cover concurrent startup, resume racing manual configure, failure cleanup, reset races, and single-handler behavior. `scripts/telegram-local-listener.mjs` is a separate standalone listener path and is not the bridge process named by the PM2 ecosystem file.
- The bridge server binds to loopback and gates browser requests by allowed Origin plus the required custom header. This blocks hostile web origins, but is not authentication against another local process; the code comments document that limit. No bridge service was started and no real Telegram event was replayed.

### TTS and OBS path

- The dashboard TEST route creates a synthetic `test` tip; it does not call TTS. The alert overlay resolves its token/config, receives the tip by Realtime or polling, queues it, refreshes settings, and claims it through `/api/overlay/claim-alert`. It then formats the configured acknowledgement and message, requests `/api/tts/synthesize`, resolves the saved clone, and plays returned audio in the Browser Source.
- Duplicate protection exists at three levels: Telegram notification uniqueness, per-page tip-ID deduplication, and the `played_in_overlay=false` database claim for cross-overlay delivery. Cross-overlay protection depends on the live database having the `played_in_overlay` column from `20261021000001_alert_overlay_claims.sql`; live migration status remains unverified. The dashboard-versus-overlay duplicate TTS request on TEST was fixed in Phase 2 and has a regression test.
- The saved clone and donor → amount → viewer-message order remain in the overlay path. The isolated test suite passed 193/193 tests, including alert ordering, saved clone selection, claim idempotency, playback outcomes, and bridge resume guards. The parser's separate seven synthetic fixtures also passed.
- README setup identifies the source as a Browser Source using the private overlay URL and says to enable **Control audio via OBS**. No OBS process was present, and port 3000 had no listener at inspection time. Therefore active source count, stream audio meter, recording output, and local monitor output could not be checked. There is no evidence of a current playback attempt or audible audio in OBS.

### Safe manual acceptance test

When the user has the app and OBS running, use one Browser Source at the existing private `/overlay/[token]` URL and one unique TEST event with a harmless synthetic message; do not create a real payment. Collect sanitized event IDs and stage logs only:

1. Confirm one `event=queued`, one successful `event_claim`, one `stage=speech_built`, one overlay `stage=synthesis_dispatch`, one successful TTS response using the selected clone, and one `playback=started`. Ensure the dashboard no longer emits a second TTS request for that same test.
2. Check the Browser Source's OBS mixer meter during playback, then make a short local OBS recording and replay it to verify program output independently of the monitoring device.
3. If local speaker monitoring is desired, check the configured OBS Monitoring Device and the source's Advanced Audio Properties separately. Do not infer local monitoring from a moving stream meter or infer stream output from audible local monitoring.

**Goal 4 status:** source-level deduplication and recovery guards are tested; parser fixtures pass. The current live Telegram connection, an actual ABA event, selected-clone synthesis response, OBS mixer, stream recording, and audible playback remain unverified because no app listener or OBS process was available. No code changes were made for Goal 4; this report was updated only. No services, OBS settings, migrations, payments, database data, or production state were changed.

## Goal 5 — Tests, build, and CI

Verification ran against `D:\pong steam\streamkit-audit-39de622`, an isolated copy, not the live application directory. SHA-256 checks confirmed that the copy's package manifest/lockfile, CI workflow, alert regression code, and bridge changes matched the current working tree before checks. No dependencies were reinstalled: the isolated copy already had `node_modules`, and its package-lock matched the project. The local runtime is Node 25.0.0 / npm 11.15.0; CI specifies Node 22.

| Check | Fresh result |
|---|---|
| `npm test` | Pass: 193 tests, 37 suites, 0 failures when loopback access was permitted. The sandbox-only attempt had 7 expected `EACCES` failures in `bridge-http.test.ts`, which binds a temporary `127.0.0.1` port. |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass: 0 errors, 50 warnings |
| `npm run verify:migrations` | Pass: 45 migrations, 299 known columns, 58 unique keys, and 13 `ON CONFLICT` clauses checked; output includes 35 non-failing review notes. |
| `git diff --check` | Pass; only existing LF-to-CRLF working-copy notices. |
| `npm run build` | In the isolated copy, again reached `Creating an optimized production build ...` and remained at `buildStage: compile` with `useBuildWorker: true` for 150 seconds. No completion, compiler error, timeout, OOM indication, or useful resource metrics were available. Stopped only this isolated build. Root cause remains unknown. |
| Hosted CI | Unavailable: `gh run list` could not connect to `api.github.com`; no remote result is inferred. |

The build stall is reproducible, but available evidence does not identify whether it comes from Next/Turbopack, the local runtime/environment, or another cause. The Windows process/resource query was denied by the environment, and no compiler diagnostic beyond the compile-stage marker was produced. The npm registry DNS issue from the prior audit remains separate; a new `npm ci` was not attempted because installed dependencies and lockfile already matched and reinstalling would require registry access.

**Goal 5 status:** tests, TypeScript, lint, migration verification, and diff hygiene pass; hosted CI and the production build remain unverified/blocked as stated. No source or dependency changes were made for Goal 5.

## Goal 6 — Health and Alert Dashboard

Added an authenticated `/dashboard/health` view and navigation link. Its status API returns only the signed-in creator's recent tip timestamps/statuses/source labels, saved TTS/clone state, a database-check result, and sanitized issues. It omits donor names, message text, amounts, raw database errors, private URLs, tokens, and clone identifiers. The recent synthesis observation is bounded, in-memory, and keyed per creator; it reports provider/audio-storage stages only and is explicitly process-local, so it may be unknown after a restart or on a different server instance.

The browser checks the existing local Telegram bridge endpoint with its established header and retains only the status/listening booleans and an error-present flag. Its private QR/error contents are never rendered. The bridge does not expose a last-connected timestamp, so the dashboard labels that as unavailable. OBS overlay connectivity is explicitly **Unknown** because the current browser source has no heartbeat. These are missing signals, not reported as healthy.

The dashboard preview is a two-second, local-only sample that makes no payment, does not contact OBS, and does not synthesize. The existing Alert Settings page remains linked for actual OBS test controls, avoiding a second speech path.

| Goal 6 verification | Result |
|---|---|
| New helper tests | Pass: 6/6, including safe event labels, bridge error redaction, and creator-isolated TTS observations |
| Full test suite | Pass: 199 tests, 37 suites, 0 failures (loopback permission allowed for bridge HTTP tests) |
| TypeScript | Pass: `npx tsc --noEmit` |
| Full lint | Pass: 0 errors, 50 existing warnings; targeted lint for all new/modified health and TTS files has 0 warnings |
| `git diff --check` | Pass |
| Live dashboard/OBS check | Not run; no local app/OBS runtime test was requested or performed. Hosted build remains blocked by the compile-stage stall documented in Goal 5. |

**Goal 6 status:** dashboard implementation is complete with honest unknown states and no schema or service changes. Live Supabase/bridge values and browser rendering still require the app to be run in the user's environment.

## Goal 7 — Alert history and template editor

Added `/dashboard/alert-history`, using the existing `tips` table with an authenticated `creator_id` filter. It supports bounded pagination, status and source filters, and search restricted to source labels. The page selects only timestamp/status/source; it does not fetch donor names, payment amounts, viewer messages, or payment credentials. Labels are allowlisted before rendering. The existing donation history remains unchanged.

Extended the existing Alerts template editor instead of adding a second settings writer. It validates unsupported placeholders, unmatched braces, empty templates, and a 1,000-character limit before saving; missing `{name}`, `{amount}`, and `{message}` tokens show non-blocking suggestions because the speech pipeline can append the viewer message. The token picker now inserts a valid numbered spacing token and exposes the existing avatar placeholder. Existing preview and saved settings path remain in use.

| Goal 7 verification | Result |
|---|---|
| History / template tests | Pass: normalization, safe labels, validation, and unsupported placeholder cases |
| Full test suite | Pass: 204 tests, 37 suites, 0 failures (loopback permission allowed for bridge HTTP tests) |
| TypeScript | Pass: `npx tsc --noEmit` |
| Full lint | Pass: 0 errors, 50 warnings; the modified Alerts page has six pre-existing warnings |
| Migration verification | Pass: 45 migrations checked; no new migration added |
| `git diff --check` | Pass |

**Goal 7 status:** implemented with existing storage; no migration was needed or applied. History uses owner-scoped reads and omits personal donation content. The alert editor retains its existing persistence flow.

## Goal 8 — Overlay management

Widget overlay URLs now include the saved widget ID while keeping the existing authenticated dashboard and public overlay-token model. The overlay RPC still validates the existing token; when a widget ID is present, the page selects only that widget's saved settings. Older token-only URLs continue rendering the root settings for compatibility. If a widget ID no longer exists, the overlay shows a clear message instead of silently displaying another widget's configuration. The dashboard has per-widget Copy URL and Preview actions and concise OBS Browser Source setup instructions.

Widget settings are validated before save (title, row count, spacing, name length, font size, stroke width, and six-digit colors). Save and delete update the UI only after Supabase confirms the owner-scoped write; errors are shown as errors without exposing database details. Existing widget/token credentials and saved clone settings are untouched. No schema or token changes were made.

| Goal 8 verification | Result |
|---|---|
| Widget URL/settings regression tests | Pass: legacy URL behavior, ID selection, missing-ID rejection, and URL token/path preservation |
| Widget validation tests | Pass: valid configuration and invalid bounds/color cases |
| Full test suite | Pass: 209 tests, 37 suites, 0 failures (loopback permission allowed for bridge HTTP tests) |
| TypeScript | Pass: `npx tsc --noEmit` |
| Full lint | Pass: 0 errors, 49 warnings across the repository; widget page has two pre-existing unused-state warnings and the overlay has one pre-existing unused-parameter warning |
| Migration verification | Pass: 45 migration files checked; no migration added or applied |
| `git diff --check` | Pass; only working-copy line-ending notices |
| Live browser-source/OBS validation | Not run; no OBS or authenticated runtime session was used, so live URL access and actual rendered preview are not claimed as verified. |

**Goal 8 status:** implemented and repository checks pass. Existing single-widget URLs remain compatible; multiple configured widgets now resolve distinct saved settings through the same existing token. OBS runtime verification remains a manual check.

## Goal 9 — Analytics and user experience

Reworked the existing authenticated Analytics page around its existing `payment_transactions` table and creator-scoped read policies. It now supports 7/30/90-day ranges, bounds queries by both range start and current time, keeps USD and KHR sums separate, shows completed counts and provider counts, and labels failed/expired/canceled/review-required records as unsuccessful. Provider labels are allowlisted. The chart uses UTC calendar dates consistently and can scroll horizontally on narrow screens. Metric definitions are visible in the page.

Database query failures now show unavailable values instead of presenting missing results as zero; raw database errors are not exposed. Added pure helper coverage for allowed ranges, UTC boundaries, currency summaries, and safe source labels. No schema change was required.

| Goal 9 verification | Result |
|---|---|
| Analytics helper tests | Pass: 3/3 |
| Full test suite | Pass: 212 tests, 37 suites, 0 failures (loopback permission allowed for bridge HTTP tests) |
| TypeScript | Pass: `npx tsc --noEmit` |
| Full lint | Pass: 0 errors, 49 repository warnings |
| Migration verification | Pass: 45 migrations checked; no migration added or applied |
| `git diff --check` | Pass; only line-ending notices |
| Live dashboard data / accessibility audit | Not run; no authenticated Supabase session or browser session was used. Responsive behavior is implemented in CSS but not visually tested in a live browser. |

**Goal 9 status:** analytics range, metric definitions, failure states, and responsive layout are implemented. Live data agreement and visual accessibility checks remain environment-dependent.

## Goal 10 — Release readiness review

### Review result: do not release yet

The worktree contains a mixture of tracked modifications and untracked additions from earlier user work and Goals 5–9. No files were reset, cleaned, stashed, committed, or pushed. In particular, the pending `20261021000002_telegram_groups_drop_session_data.sql` remains untouched and unapplied. The full dirty worktree is not suitable for an automatic commit selection; review and stage intentional files individually after the user approves a release candidate.

### Verification snapshot

| Check | Current result |
|---|---|
| Full automated tests | Pass: 212/212, 37 suites; bridge HTTP tests required loopback permission |
| TypeScript | Pass: `npx tsc --noEmit` |
| Full lint | Pass: 0 errors, 49 warnings |
| Migration text verification | Pass: 45 migration files; review notes remain non-failing; no migration was run |
| `git diff --check` | Pass; Git reports only LF-to-CRLF working-copy notices |
| Production build | Not ready: isolated build repeatedly stalls during optimized compilation; cause unknown |
| Hosted CI | Unavailable: API network lookup failed; no CI result inferred |
| Live Supabase schema/grants/RLS | Unverified: no authorized read-only database connection was available |
| Live ABA/Telegram payment and OBS audible playback | Unverified: no real payment was made and no OBS acceptance test was performed |
| PayPal | Not implemented in the repository; only ABA/Bakong paths are present |

### Remaining release blockers and safest next steps

1. Obtain the authorized administrator's read-only schema, migration-history, grants, and RLS query results documented in the Goal 3 section. Resolve the `telegram_groups.session_data` discrepancy and evaluate `tips` access before changing or applying any migration.
2. Diagnose the isolated Next.js compile-stage stall in a supported clean environment and retrieve hosted CI status when network access is available. Do not treat the build or CI as passing.
3. With the user's existing app and OBS session active, perform one synthetic TEST alert through one Browser Source. Confirm the audio in an OBS recording and the audio meter; do not infer audible output from TTS logs.
4. Review the mixed worktree and stage only explicitly intended files. Do not deploy, migrate, process real payments, commit, or push until the user approves those actions.
5. If PayPal is required, plan its sandbox integration as a separate goal; current ABA/Bakong support does not imply PayPal ingestion.

**Goal 10 status:** release review is complete and the recommendation is **NO-GO** until the build/CI, live database security, and OBS audible-playback blockers above have evidence. No deployment or production action occurred.
