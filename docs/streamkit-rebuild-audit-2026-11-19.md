# StreamKit dashboard rebuild audit — 2026-11-19

## Objective

Rebuild the authenticated creator dashboard and complete a full-project quality pass while preserving the existing Next.js/Supabase architecture, ABA PayWay and Bakong payment separation, OBS overlay URLs, Telegram bridge, and VoiceStudio integration.

Authorized work: dashboard UI/UX, component refactoring, frontend bug fixes, safe application-code fixes, tests, documentation, and the protected source fixes listed below.

Approval was granted on 2026-11-19 for protected source fixes and a production build. No live SQL, provider credentials, secrets, deployments, pushes, releases, service restarts, or data reconciliation were performed.

## Baseline

- Workspace root: `D:\pong steam\streamkit`.
- Frozen reference copy: `D:\pong steam\streamkit-audit-39de622/` — read-only, never edit.
- Branch: `main...origin/main`. The repository already contained extensive staged and unstaged changes before this work; all pre-existing changes were preserved.
- Baseline commit hash was not captured visibly because the combined Git status output was truncated.
- No local listener on port `3000`.
- No source edits were made before this report.
- Production build was not run because builds require separate approval. `npx tsc --noEmit` was used as the static compile check.

### Baseline verification

| Command | Result |
| --- | --- |
| `npm run verify:migrations` | PASS — `migrations checked : 70`, `columns known : 518`, `unique keys known : 88`, `ON CONFLICT checked : 18`, `notes (40)` |
| `npx tsc --noEmit` | PASS, no output |
| `npm run lint` | FAIL — 10 errors, 70 warnings |
| `npm test` | FAIL — 343 pass, 1 fail |
| `npm run build` | Not run; approval required |

### Baseline lint errors

1. `src/app/api/admin/donation-photo/route.ts:21:9` — `'createServerClient' is assigned a value that is never used.`
2. `src/app/api/alerts/test/route.ts:37:9` — `'body' is assigned a value that is never used.`
3. `src/app/api/overlay/charity/route.ts:5:10` — `'createClient' is defined but never used.`
4. `src/app/api/overlay/youtube/route.ts:5:10` — `'createClient' is defined but never used.`
5. `src/app/api/redeems/spend/route.ts:40:9` — `'user' is assigned a value that is never used.`
6. `src/app/dashboard/goals/page.tsx:153:18` — `'handleGoalInputChange' is defined but never used.`
7. `src/app/dashboard/page.tsx:220:9` — `'subscriptionTiers' is declared but its value is never read.`
8. `src/app/overlay/champion/page.tsx:136:9` — `'setIsShieldActive' is declared but its value is never read.`
9. `src/app/overlay/multi-stream/page.tsx:187:9` — `'setIsShieldActive' is declared but its value is never read.`
10. `tests/dashboard-motion.test.ts:16:11` — `'fs' is assigned a value that is never used.`

Most of the 70 warnings are pre-existing unused variables or React `set-state-in-effect` warnings.

### Baseline test failure

`tests/fan-points.test.ts` fails at module load because it calls `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` before a test environment is loaded. `npm test` does not load `.env.local`, `.env.example`, or `tests/.env.example`, so Supabase throws `supabaseUrl is required.`.

Secondary issues in the same file:

- `tests/fan-points.test.ts:236-239` reads `SUPABASE_ANON_KEY` while the examples document `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `cleanup()` at `tests/fan-points.test.ts:8-12` deletes all rows from `redeem_claims`, `redeems`, and `fan_points`.

## Instruction and standards review

Read and applied:

- `D:\pong steam\AGENTS.md`
- `D:\pong steam\streamkit\AGENTS.md`
- `D:\pong steam\streamkit\PROJECT_MEMORY.md` relevant sections
- `D:\pong steam\SKILL.md`
- `D:\pong steam\streamkit\SKILL.md`
- `D:\pong steam\streamkit\skills-lock.json`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- Project-local skills under `.agents/skills/` and identical `.claude/skills/`: `chatgpt-handoff`, `debugging`, `frontend-design`, `obs-tts`, `payment-integrations`, `release-readiness`, `supabase-security`, `system-design`, `telegram-bridge`, `testing-regression`
- Global skills: `clean-code`, `senior-fullstack`, `senior-backend`, `security-audit`, `senior-security`

Key standards followed:

- Preserve existing architecture and dependencies; do not introduce DaisyUI.
- Keep ABA PayWay and Bakong QR/payment identity distinct.
- Keep credentials server-side; do not read or print `.env.local`.
- Use existing Supabase, Next.js App Router, React 19, Framer Motion, and CSS Modules patterns.
- Preserve OBS transparency behavior and reduced-motion support.

## Feature inventory

### Authenticated creator dashboard

Known dashboard routes and surfaces found under `src/app/dashboard/**` and `src/components/dashboard/**`:

- Overview: `src/app/dashboard/page.tsx`
  - Welcome header, daily donations chart, recent payments, mobile alert button, quick actions, OBS overlay links.
- Navigation shell: `src/app/dashboard/layout.tsx`, `src/components/dashboard/DashboardNav.tsx`
  - Server-side auth gate, skip link, offline notice, sidebar, theme toggle, sign-out.
- Alerts and TTS: `src/app/dashboard/alerts/page.tsx`, `src/app/dashboard/voice-settings/page.tsx`
  - Alert canvas, tiers, templates, timing, audio, Khmer fonts, voice clones, test alert.
- Donations and payments: `src/app/dashboard/donations/page.tsx`, `src/app/dashboard/tips/page.tsx`, `src/app/dashboard/subscriptions/page.tsx`
- Widgets and overlays: `src/app/dashboard/widgets/page.tsx`, `src/app/dashboard/spin-wheel/page.tsx`, `src/app/dashboard/leaderboard/page.tsx`, `src/app/dashboard/widget-overlays/page.tsx`, `src/app/dashboard/goals/page.tsx`, `src/app/dashboard/health/page.tsx`
- Streaming workflow: `src/app/dashboard/go-live/page.tsx`
- Integrations: `src/app/dashboard/kit-client/page.tsx`, `src/app/dashboard/telegram/page.tsx`, `src/app/dashboard/voice-settings/page.tsx`
- Public/creator surfaces outside the dashboard: `src/app/[username]/page.tsx`, `src/app/overlay/**`, `src/app/pay/**`, `src/app/api/**`.

### Admin area

- Admin navigation: `src/config/adminNavigation.ts`
- Admin UI: `src/app/admin/**`
- Billing admin: `src/app/admin/billing/page.tsx`
- Admin APIs: `src/app/api/admin/**`
- Authorization helper: `src/lib/auth/requirePlatformRole.ts`
- Platform role definitions: `src/lib/auth/platformRoles.ts`

## Redesign plan

1. Keep the existing App Router structure and preserve all working routes.
2. Standardize the dashboard on the Aurora Night token system defined in `src/app/dashboard/dashboard-theme.css`.
3. Use sentence case for primary labels, explicit loading/empty/error states, visible focus rings, and 44 px mobile touch targets.
4. Keep Framer Motion for small progressive enhancements only; respect `prefers-reduced-motion`.
5. Replace dead admin navigation entries with links to real pages until missing pages are implemented and approved.
6. Fix local UI defects with minimal diffs: mojibake, misleading controls, destructive-action confirmation, toast success/failure tone, default-tier selection, tips verification debounce.
7. Extract admin billing interactivity into a client component while leaving Supabase admin access in the server component.
8. Make destructive integration tests opt-in and scoped to test-created rows.
9. Add focused regression tests, then run targeted tests, full tests, lint, typecheck, and migration verification.

## Finding register

Status values: `Fixed — verified`, `Fixed in source — live application required`, `Documented — approval required`, `Open`, `Not verified`.

### Authorized frontend and application findings

| ID | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| UI-01 | Medium | Mojibake in visible dashboard/goals copy and comments | `src/app/dashboard/page.tsx`, `src/app/dashboard/goals/page.tsx`, `supabase/migrations/20261118000002_cards.sql` | Fixed — verified |
| UI-02 | Low | Unused `subscriptionTiers` query on dashboard overview | `src/app/dashboard/page.tsx` | Fixed — verified |
| UI-03 | Medium | Alert test toast always displays success styling/copy even on failure | `src/app/dashboard/alerts/page.tsx` | Fixed — verified |
| UI-04 | Medium | Alert tier delete has no confirmation | `src/app/dashboard/alerts/page.tsx` | Fixed — verified |
| UI-05 | Medium | Tier selector falls back to base settings instead of previously selected tier after a failed save | `src/app/dashboard/alerts/page.tsx` | Fixed — verified |
| UI-06 | Medium | Local-only alert controls (`bannedWords`, `scope`, `isEnabled`, `alertType`) appear persisted/applied but are not saved or used by test payloads | `src/app/dashboard/alerts/page.tsx` | Fixed — verified |
| UI-07 | Medium | Tips USD/KHR verification debounce clears both timers instead of only the selected currency timer | `src/app/dashboard/tips/page.tsx` | Fixed — verified |
| UI-08 | High | Admin navigation links to missing routes | `src/config/adminNavigation.ts` | Fixed — verified |
| UI-09 | High | Admin billing server component contains client-only event handlers | `src/app/admin/billing/page.tsx`, `src/app/admin/billing/BillingTiersClient.tsx` | Fixed — verified |
| UI-10 | Medium | Dashboard has no App Router error boundary/reset state under `src/app/dashboard` | `src/app/dashboard/error.tsx` | Fixed — verified |
| TEST-01 | Medium | Fan-points integration test runs by default with missing env and has global destructive cleanup | `tests/fan-points.test.ts`, `tests/.env.example` | Fixed — verified |
| LINT-01 | Medium | Ten ESLint errors across APIs, overlays, dashboard, and tests | Final lint output | Fixed — verified |

### Protected findings — do not change without approval

| ID | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | Critical | Platform-role hierarchy is inverted: any authenticated user with any unexpired role row, including `viewer`, can satisfy admin gates | `supabase/migrations/20261111000004_platform_roles.sql`, `20261119000001_fix_platform_role_hierarchy.sql`, `src/lib/auth/requirePlatformRole.ts` | Fixed in source — live application required |
| PAY-01 | High | ABA payment creation can be routed away from ABA webhook handling | `src/app/api/payments/webhook/route.ts:14-20`, `src/app/api/payments/khqr/route.ts:443-446` | Fixed — verified |
| PAY-02 | High | ABA RPC row-locks but lacks a current-status guard; `p_verified_amount`/`p_verified_currency` are accepted but unused | `supabase/migrations/20261111000009_subscription_payment_rpcs.sql`, `20261119000002_aba_completion_guard.sql`, `supabase_schema.sql`, `20261111000001_sync_canonical_schema.sql` | Fixed in source — live application required |
| PAY-03 | High | Invalid PL/pgSQL in subscription payment migration: missing `case when` at line 84; the migration verifier skips dollar-quoted bodies | `supabase/migrations/20261111000009_subscription_payment_rpcs.sql`, `scripts/verify-migrations.mjs` | Fixed in source — live application required |
| DOC-01 | Critical | Live schema/migrations cannot be inferred from repository files; manual migration workflow means migration files do not prove applied state | `AGENTS.md:24-33`; `PROJECT_MEMORY.md:41-52`, `:606-635`, `:1144-1176`, `:1228-1235`; `docs/repository-audit-2026-10-18.md` | Open — live DB access required |

## Remaining risk

- Static source review does not prove live database, provider, Telegram bridge, or VoiceStudio state.
- No browser-based visual or responsive verification was available; responsive behavior was statically reviewed only.
- `20261119000001_fix_platform_role_hierarchy.sql` and `20261119000002_aba_completion_guard.sql` are written but were not applied to a live database. Manual application in the Supabase SQL editor is still required.
- `DOC-01` remains open because live schema state cannot be inferred from repository files.
- A custom `ABA_PAYWAY_CALLBACK_URL` that sends callbacks outside this app remains outside repository control; callbacks delivered to this app now dispatch correctly regardless of `PAYMENT_PROVIDER`.
- No commit, push, deployment, service restart, provider credential change, or live-data reconciliation was performed.

## Final delivery status

Authorized UI, application-code, test, and documentation fixes are implemented. Approved protected source fixes are implemented. Static verification and the production build pass. Live migration application and live-system verification remain owner tasks.

### Final verification

| Command | Result |
| --- | --- |
| `node --test tests/dashboard-quality.test.ts tests/fan-points.test.ts` | PASS — 8 pass, 0 fail, 1 skipped |
| `node --test tests/platform-roles.test.ts` | PASS — 3 pass, 0 fail |
| `node --test tests/payment-safety.test.ts` | PASS — 19 pass, 0 fail |
| `npm test` | PASS — 359 tests, 358 pass, 0 fail, 1 skipped |
| `npm run lint` | PASS — 0 errors, 63 pre-existing warnings |
| `npx tsc --noEmit` | PASS, no output |
| `npm run verify:migrations` | PASS — `migrations checked : 72`, `columns known : 518`, `unique keys known : 88`, `ON CONFLICT checked : 18`, `notes (40)` |
| `npm run build` | PASS — Next.js 16.4.5, 101 static pages generated |

Port `3000` was checked before the build and no dev server was listening.

`supabase/migrations/20261118000002_cards.sql` received a comment-only mojibake cleanup. No DDL or behavior was changed.

### Changed-file inventory

Documentation:

- `docs/streamkit-rebuild-audit-2026-11-19.md` (new)
- `docs/dashboard-design-system.md` (new)

Dashboard UI and error states:

- `src/app/dashboard/page.tsx`
- `src/app/dashboard/dashboard.module.css`
- `src/app/dashboard/error.tsx` (new)
- `src/app/dashboard/goals/page.tsx`
- `src/app/dashboard/alerts/page.tsx`
- `src/app/dashboard/alerts/alerts-dashboard.module.css`
- `src/app/dashboard/tips/page.tsx`

Admin and navigation:

- `src/config/adminNavigation.ts`
- `src/app/admin/billing/page.tsx`
- `src/app/admin/billing/BillingTiersClient.tsx` (new)

Approved platform-role fixes:

- `src/lib/auth/requirePlatformRole.ts`
- `supabase/migrations/20261111000004_platform_roles.sql`
- `supabase/migrations/20261119000001_fix_platform_role_hierarchy.sql` (new)

Approved payment fixes:

- `src/app/api/payments/webhook/route.ts`
- `supabase/migrations/20261111000009_subscription_payment_rpcs.sql`
- `supabase/migrations/20261119000002_aba_completion_guard.sql` (new)
- `supabase_schema.sql`
- `supabase/migrations/20261111000001_sync_canonical_schema.sql`
- `scripts/verify-migrations.mjs`

Lint fixes:

- `src/app/api/overlay/card-battle/route.ts`
- `src/app/api/youtube-chat/route.ts`
- `src/app/overlay/cards/page.tsx`
- `src/app/overlay/redeem/page.tsx`

Tests and test configuration:

- `tests/fan-points.test.ts`
- `tests/.env.example`
- `tests/dashboard-quality.test.ts` (new)
- `tests/payment-safety.test.ts`
- `tests/platform-roles.test.ts` (new)

Migration text cleanup:

- `supabase/migrations/20261118000002_cards.sql` (comments only)

The worktree contains many pre-existing staged and unstaged changes. A broad `git diff HEAD --stat` over dashboard paths therefore includes prior work and is not a clean diff for this task.
