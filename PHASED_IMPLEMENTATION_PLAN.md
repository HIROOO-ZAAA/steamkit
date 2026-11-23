# StreamKit Implementation Status and Plan

> **Historical snapshot: last reviewed 2026-10-14.** This plan describes the
> repository at that date. Its route list, framework version, migration count,
> and remaining-work statuses are not current. For newer findings, see the
> [2026-11-19 rebuild audit](./docs/streamkit-rebuild-audit-2026-11-19.md), and
> verify current source and live database state before acting.

---

## 1. Snapshot as of 2026-10-14

### Stack
Next.js 16.3 (App Router) · React 19 · TypeScript 5 · Tailwind 3.4 · Supabase
(Auth / Postgres / Realtime / Storage) · Framer Motion · lucide-react ·
OBS WebSocket · Teleproto local listener.

### Database
- 44 migration files under `supabase/migrations/`, run **by hand** — see §4.
- Key tables: `profiles`, `tips`, `donations`, `payment_transactions`,
  `payment_webhooks`, `alert_settings`, `alert_tiers`, `alert_voice_intro`,
  `streamkit_overlay_credentials`, `voice_settings`, `donation_goals`,
  `spin_wheels`, `raffles`, `raffle_entries`, `subathons`, `telegram_*`,
  `subscription_tiers`, `login_sessions`, `creator_tip_settings`,
  `creator_merchant_credentials`.
- Most feature reads/writes still run **from the browser via the public Supabase
  client**, guarded by RLS. There is no service/API layer for profile, alerts,
  goals or widgets.

### Route map (verified from `next build`)
| Area | Routes |
|---|---|
| Public | `/`, `/pay/[username]` (+ `opengraph-image`), `/p/[slug]`, `/login` |
| Auth | `/auth`, `/auth/callback` |
| Dashboard | `/dashboard`, `alerts`, `alert-box`, `analytics`, `browser-source`, `chat`, `donations`, `goals`, `kit-client`, `leaderboard`, `media-share`, `obs`, `raffle`, `settings` (+ `login-history`), `spin-wheel`, `subathon`, `subscriptions`, `telegram`, `tips`, `voice`, `widget-overlays`, `widgets`, `projects/*` |
| Overlays | `/overlay/alerts`, `overlay/[token]`, `overlay/feed`, `overlay/goals`, `overlay/leaderboard`, `overlay/spin-wheel`, `overlay/widget` |
| API | `payments/*` (create, khqr, qr, aba, aba-config, aba/verify, webhook, dev, `[paymentId]/status`), `alerts/test`, `donation-voice`, `telegram/*` (devices, groups, link, webhook, local-agent), `admin/*` (donation-photo, payment-config), `auth/session-log` |

Every link in the Phase 0 audit that was flagged as pointing at a missing route
(`/dashboard/telegram`, `/analytics`, `/subscriptions`) now exists. Two never
built: `/dashboard/admin` (API only, no UI) and `/overlay/chat/demo`.

---

## 2. Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Audit and foundation | Done |
| 1 | Design system | **Partial** — tokens in `globals.css`, per-page CSS Modules. No shared form/table/modal/toast layer. Two products still coexist (creator tipping vs. legacy `projects`/`stream_events`). |
| 2 | Public website | **Partial** — landing + tip page with OG image. No marketing, legal, or recovery pages. |
| 3 | Auth and users | **Mostly done** — email/password, Google OAuth, callback exchange, middleware gate, login history. |
| 4 | Creator profile and dashboard | Done — `/dashboard/settings` holds identity + media; `/dashboard` is the overview. |
| 5 | Donations | Done — donation intents, public tipping, explicit non-success states. |
| 6 | Cambodian payments | Done — provider abstraction (`src/lib/payments/`), ABA PayWay, Bakong/KHQR, verified webhooks, idempotency keys, expiry, amount/currency/timestamp checks. |
| 7 | Alerts and OBS | **Done** — per-(creator,tier) settings, tiers, donor voice messages, token rotation in `browser-source`, alert queue, preview, TTS. |
| 8 | Goals and leaderboards | Done — both confirmed-donation backed, with public and overlay views. |
| 9 | Realtime | Done — channel subscriptions plus a 3s polling fallback and a 4s config refresh. |
| 10 | Spin wheel and raffle | **Partial** — wheel persists; the winning slice is still `Math.random` client-side. Raffle has no server-side draw. |
| 11 | Subathon | **Unverified** — timer UI exists; authoritative persisted state not confirmed. |
| 12 | YouTube Live | **Not started** — `youtubeUrl` on the tip page is only a link. No OAuth, no chat API. |
| 13 | Telegram | Done — device/agent linking, groups, payment notifications, local listener bridge. |
| 14 | Analytics | Page exists; metric definitions not re-verified against confirmed donations. |
| 15 | Subscriptions | Page exists; payment/status model not verified. |
| 16 | Admin | **Partial** — `/api/admin/*` only. No admin UI, no audit log. |
| 17–23 | Security / performance / a11y / consistency / E2E / prod readiness / release audit | **Not systematically done.** |

---

## 3. Open defects found during the 2026-10-14 review

Fixed in this session:
1. **Per-tier TEXT DELAY never reached the overlay.** Migration `007` emitted the
   tier key as `delay_seconds`; `applyTier` reads `text_delay` and silently
   drops unknown keys. Fixed by `20261019000008`.
2. **`tips.photo_path` was never populated**, so donation photos could not render
   on the overlay at all. Fixed by the `tips_copy_donation_media` trigger in
   `20261019000009`.
3. **The overlay's polling path lost all media.** `streamkit_recent_alerts`
   returned no photo/voice columns, so media vanished whenever realtime was
   blocked or reconnecting. Fixed in `20261019000009`.
4. **`streamkit_recent_alerts` could not be replaced** — added OUT parameters
   without a `DROP FUNCTION`, failing with 42P13.

Still open:
5. **Spin-wheel and raffle winners are client-side `Math.random`.** Not
   authoritative; a creator cannot prove a result was fair.
6. **The "VOICE MESSAGE INTRO" toggle was dead** from introduction until
   `2026-10-14`. Donors had no way to send a voice message. Now built, but
   untested against a live project.
7. **`/dashboard/subathon`, `/dashboard/analytics`, `/dashboard/subscriptions`
   and `/dashboard/chat` have not been re-verified** against the schema they read.
8. **Lint is clean** — 0 errors, 55 warnings. Resolved 2026-10-14.
9. **No tests.** Resolved 2026-10-15 — see §5 item 6.
10. **The "voice clone" feature never cloned anything.** `voice_settings`
    carried `cloning_enabled` / `cloned_voice_id` from the first alert
    migration, and the overlay's `resolveVoice()` only ever looked up a Web
    Speech API voice on the host OS. Khmer read-aloud depended on whatever
    voice Windows happened to have, which on a clean install is none. Rebuilt
    2026-10-14 as `20261019000011` + a local VoxCPM2 sidecar; the old columns
    are now dead weight and could be dropped in a later migration.

---

## 4. Migrations are applied by hand

`supabase/.temp` contains no `project-ref`: the Supabase CLI is **not linked** to
a project. Dropping a file into `supabase/migrations/` does nothing on its own —
each one must be pasted into the Supabase SQL editor.

This has already caused drift: `src/lib/types.ts` cites
`20261019000003_donation_photo_moderation.sql`, which was never written to disk
because those columns were applied directly to the project. They were backfilled
idempotently in `20261019000009`.

**Watch out for:** `CREATE OR REPLACE FUNCTION` cannot change a return type or
add parameters (PostgreSQL `42P13`). Any function whose `RETURNS TABLE(...)` list
changes needs an explicit `DROP FUNCTION IF EXISTS` first. A trailing
default-valued parameter is *not* a substitute — it creates an ambiguous
overload instead of replacing the old signature.

---

## 5. Historical recommendations as of 2026-10-14

1. **Hear it in OBS.** The loop is verified over HTTP and in a headless
   browser, and the four defects that made it silent are fixed — but no one has
   *heard* the alert voice. Everything needed for that test is in
   `PROJECT_MEMORY.md` under "OBS test setup on this machine": the live source is
   `Browser 5` in scene `Game`, all five browser sources point at
   `localhost:3000` so `npm run dev` must be running, and `Browser 2` is the
   same URL in other scenes and must not be visible at the same time.
   **Never run `npm run build` while the dev server is up** — it overwrites the
   dev chunks and the overlay goes silent with no error anywhere.
2. **Re-upload both clones with a transcript.** `ref_text` is now required. The
   samples are `~/Downloads/ambatukam.mp3` (10.3s, in range). Do not use
   `npm run voice:transcribe` output for a Khmer clip — it returned confident,
   fluent, wrong English. Keep both existing clones until a replacement is
   confirmed working, and leave `active_clone_id` alone until then.
3. **The API side is done** — verified 2026-10-16; observed in a real browser
   2026-10-17, which found four more defects. A Chromium
   driven over CDP against a production build now exercises the full loop:
   navigate `/overlay/alerts?token=`, inject a tip through the service client,
   and read the page's own console. Clone resolution, the stock-voice fallback,
   the tts-cache bucket and the token/ownership gates are all confirmed with
   measurements.

   What that session found, all now fixed — see `PROJECT_MEMORY.md` for detail:
   - a timeout handed the stock-voice fallback a **negative** budget
     (`TimeoutNegativeWarning: -263`), so a slow clone cost the alert every
     voice rather than only the cloned one;
   - **aborting our fetch does not cancel the provider's work**, so timed-out
     attempts kept the single GPU worker busy and wedged the voice permanently;
   - a clone with no `ref_text` is transcribed on the GPU during every
     synthesis — 3.7-6.0s versus 2.9-3.6s, and it fails outright on a busy GPU.
     Now required at upload;
   - **`npm run dev` could not hydrate any overlay page at all** (`middleware`
     matched `/_next/hmr`, plus Next 16's `allowedDevOrigins`), so nothing in
     the overlay was testable outside a production build.

   **Still not done:** the voice has never been *heard*. See item 1.
4. **VoxCPM — historical, removed.** The VoxCPM sidecar is gone; voice cloning is
   VoiceStudio-based. Kept only so the notes are not mistaken for current state.
5. **Link the Supabase CLI** so migrations stop being copy-pasted. **Blocked:**
   the CLI is not installed and there is no `project-ref`. Needs the user to
   install it and supply the project ref + access token.
6. **Server-authoritative draws — code complete, unverified (2026-10-16).**
   Migration `20261015000002_draws_server_authoritative.sql` plus client
   rewiring in `dashboard/raffle`, `dashboard/spin-wheel` and
   `overlay/spin-wheel`. No `Math.random()` remains in any draw path. The raffle
   now persists entries to `raffle_entries` instead of React state, so "Reset"
   is real and entries survive a refresh.
   Still open: none of it has run against a live database, and the SQL has never
   been executed — review it before pasting.
6. **Test setup — DONE 2026-10-15.** `npm test` runs 24 tests over
   `parseTemplate`, `pickTier`, `applyTier` and the KHR/USD tier boundaries,
   with no test dependency (Node 25 strips types natively). The pure logic was
   moved out of the overlay client component into
   `src/lib/overlay/alert-logic.ts` to make it reachable. Read the
   `applyTier` silent-drop invariant in `PROJECT_MEMORY.md` before adding any
   new tier field. Still worth extending to the ABA parser.
7. **Reconcile the two product surfaces** — decide whether legacy
   `projects`/`stream_events` ships at all, or gets deleted.
8. **YouTube Live** — the largest untouched feature.
9. Phases 17–23 in the original order once the above are settled.

---

## 6. Development checklist (unchanged rule)

Phase completion requires the app to run, feature behaviour to be tested, errors
fixed, responsive/UI/security implications reviewed, database/API behaviour
verified, and evidence recorded before the next phase starts.
