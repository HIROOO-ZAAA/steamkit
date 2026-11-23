<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StreamKit repo guide

Next.js 16 App Router + React 19 + Supabase creator tipping platform: public tip pages, creator dashboard, OBS overlays, VoiceStudio voice clones, and a local Telegram/payment bridge. Commands below run from `streamkit/`.

## Commands

- `npm run dev` — Next dev server on :3000. OBS browser sources point at `http://localhost:3000`; overlays only work while this is running.
- `npm test` — `node --test "tests/**/*.test.ts"`. Uses Node's native TypeScript stripping (local Node 25, CI Node 22); no jest/vitest/ts-node. Single file: `node --test tests/alert-logic.test.ts`. Most tests are pure; bridge tests bind loopback sockets.
- `npm run lint` — flat ESLint. No typecheck script exists; `next build` type-checks.
- `npm run verify:migrations` — static scan of `supabase_schema.sql` + `supabase/migrations/*.sql`. Run it before handing over migration work; it does not execute SQL.
- Full verification order (mirrors CI): `npm run verify:migrations` -> `npm run lint` -> `npm test` -> `npm run build`.
- CI (`.github/workflows/ci.yml`) builds with dummy env values. If a module-scope route starts reading a new env var, add a placeholder to that build step or CI fails.

## Hard rules

- Never run `npm run build` while `npm run dev` is running. Next 16 overwrites the dev server's chunks under `.next`; pages then return HTML with zero JS, no errors, and no overlay — indistinguishable from a dead backend. Recover by stopping dev, `Remove-Item .next -Recurse -Force`, `npm run dev`, then reload the OBS source.
- Migrations are applied by hand in the Supabase SQL editor; the CLI is not installed or linked. A file in `supabase/migrations/` proves nothing about the live database — verify columns live before trusting code. To rebuild, apply `supabase_schema.sql` first, then migrations in filename order.
- Write text files as UTF-8 without BOM. PowerShell 5.1 adds a BOM by default and has broken `next build` with "Error parsing package.json file". Use `[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))`.
- Keep the `.ts` extension on relative imports in tests. Node ESM requires it, and `allowImportingTsExtensions` is enabled for exactly this — do not remove it.
- `src/proxy.ts` is Next 16's renamed middleware. Its matcher intentionally excludes all of `_next` so the HMR websocket is not intercepted. `allowedDevOrigins` in `next.config.ts` exists because OBS uses `127.0.0.1` while dev binds `localhost`; removing either breaks dev overlay hydration.
- All VoiceStudio synthesis must go through `onTheProvider()` in `src/lib/voice/voicestudio.ts`. The GPU pool has one worker and aborting a fetch does not cancel the job; a timed-out synthesis must return 504 rather than retry, or later alerts get wedged.
- Alert-tier fields only apply if the base `AlertSettings` already has the key (`applyTier`). Adding a column to the tier SQL without updating `applyConfig` in `src/app/overlay/alerts/page.tsx` silently drops it.
- `.env.local` and `telegram-local-session.enc` hold live secrets and are git-ignored. Keep service-role, payment, and TTS credentials server-side; never expose them via `NEXT_PUBLIC_*`.

## Orientation

- `src/app/` — App Router: `dashboard/`, public `[username]` and `pay/[username]`, OBS pages under `overlay/*`, API handlers under `api/*`. The README route table is outdated; enumerate `src/app` for the real list.
- `src/lib/overlay/` — pure alert/tip logic extracted for tests. Other shared code: `src/lib/voice/`, `src/lib/payments/`, `src/lib/supabase/`, `src/lib/telegram/`.
- `scripts/*.mjs` — kit-client bridge, Telegram listener, ABA parser, migration verifier. `ecosystem.config.js` runs the whole stack under pm2, including `D:\VoiceStudio` and `D:\cloudflared.exe`.
- `PROJECT_MEMORY.md` records root causes and traps not visible in the code (voice worker saturation, payment provider precedence, overlay audio/autoplay). `docs/migrations.md` is the database workflow. `docs/repository-audit-2026-10-18.md` is a point-in-time audit, not current state.


## AI Coding Harness - Operating Rules

### Second Brain Access Policy
- Coding agents may read and search relevant StreamKit Second Brain documents for StreamKit tasks without asking for separate access approval.
- Limit access to relevant project knowledge, including architecture, payment decisions, security findings, historical bugs, and implementation context.
- Do not access unrelated sibling directories, personal files, or external accounts.
- Treat Second Brain content as historical context and guidance, not proof of current implementation.
- Verify current behavior against repository source and live systems when appropriate.
- Label findings as VERIFIED, PROPOSED, ASSUMPTION, or OUTDATED.
- Do not modify, delete, rename, or reorganize Second Brain documents without explicit approval.
- Never copy secrets, credentials, private keys, session data, or sensitive user information into agent handoffs.
- User approval and this repository's safety rules take precedence over skill instructions and historical documentation.

### 1. Inspect Before Acting
- Read the relevant project instructions and PROJECT_MEMORY.md sections before working.
- Consult the StreamKit Second Brain for relevant decisions and evidence.
- Inspect the current implementation before proposing a fix.
- Never assume a migration file reflects the live Supabase database.

### 2. Evidence Standards
Classify technical findings as:
- VERIFIED - supported by source, live inspection, or reliable tests.
- PROPOSED - recommended but not implemented.
- ASSUMPTION - not yet verified.
- OUTDATED - previously verified but no longer confirmed.

Include relevant file paths, database objects, and test evidence.

### 3. Approval Gates
- Read-only inspection is the default.
- Show the proposed files, changes, risks, and verification plan before editing.
- Obtain explicit approval before source edits.
- Obtain separate explicit approval before database changes, SQL execution, migrations, deployments, pushes, dependency changes, builds, or service restarts.
- Never interpret approval for one operation as approval for another.

### 4. Preserve Existing Work
- Inspect Git status before changing files.
- Preserve all existing uncommitted changes.
- Never reset, clean, overwrite, or discard unrelated work.
- Never commit or push without explicit approval.

### 5. Change and Test Discipline
- Make one logical change at a time.
- Prefer minimal fixes over unrelated refactoring.
- Add or update focused regression tests for approved bug fixes.
- Do not claim a test or verification passed unless it was actually run.
- Report failures and unresolved risks honestly.

### 6. StreamKit Integration Protection
Preserve existing ABA PayWay, Bakong, Telegram, Supabase, OBS, and VoiceStudio integrations.
Never remove, replace, or weaken their security controls without explicit approval.

### 7. Secret Protection
- Never expose credentials, tokens, session files, or private keys.
- Do not print the contents of secret environment files.
- Keep private credentials server-side.
- Never put secrets in NEXT_PUBLIC_* variables.
