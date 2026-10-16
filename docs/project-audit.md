# Existing Project Audit

**Audit date:** 2026-10-01  
**Scope:** Repository inspection for Phase 00. No runtime code, schema, or environment values were changed.

## Executive Summary

The existing project is a runnable Next.js creator dashboard prototype with Supabase Auth, PostgreSQL client access, and Realtime subscriptions. It already has creator profile, tipping settings, alert, goal, leaderboard, spin-wheel, raffle, subathon, voice, OBS, and project/activity-feed surfaces.

It is not yet a production donation platform. Payment provider initialization and server-side payment verification are absent; the public tipping page inserts directly into `tips`, whose checked-in schema defaults `payment_status` to `successful`. Some feature pages are demo-only, several navigation destinations are missing, and the current database policies expose or accept more public data than a production donation workflow should.

The repository has an existing `PHASED_IMPLEMENTATION_PLAN.md`; this audit records the current inspected state in the requested location. Only this audit document is added in Phase 00. The live Supabase project, storage buckets, Edge Functions, and deployed RLS state were not inspected, so repository evidence must not be treated as confirmation of live database configuration.

## What Exists

### Stack and Project Structure

- Next.js 16.3.8 App Router, React 19.2.8, and TypeScript 5.
- Supabase JS 2 and `@supabase/ssr`; no ORM or migration runner is configured.
- Routes and route-level CSS Modules are under `src/app/`.
- Shared UI files are under `src/components/ui/`; shared navigation is `src/components/DashboardNav.tsx`.
- Supabase browser/server clients are under `src/lib/supabase/`; shared row types are in `src/lib/types.ts`.
- `supabase_schema.sql` is the only checked-in database schema artifact. There is no `src/app/api/` route tree or `supabase/` migrations/functions directory.
- `public/` contains the default Next.js SVG assets; no product-specific media assets were found.
- Scripts are `dev`, `build`, `start`, and `lint`. No automated test runner or test script is configured.

### Environment and Supabase Wiring

- Browser and server clients use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The Next.js dev server reported `.env.local` as loaded. Secret values were not read or recorded; variable validity and live project access were not separately tested.
- `src/middleware.ts` refreshes Supabase auth cookies and redirects unauthenticated `/dashboard` requests to `/auth`.
- `src/app/dashboard/layout.tsx` also checks the current user on the server and redirects unauthenticated users.
- The supplied schema creates `profiles`, `tip_settings`, `alert_settings`, `voice_settings`, `donation_goals`, `spin_wheels`, `raffles`, `raffle_entries`, `subathons`, `telegram_connections`, `subscription_tiers`, and `tips`.
- RLS is enabled in the supplied SQL. Realtime publication setup is included for `tips` and `donation_goals`.
- No storage bucket declarations, Edge Function source, payment webhook, or other backend/service layer is checked into this repository.

### Authentication

- `/auth` has email/password sign-up and sign-in plus Google OAuth initiation.
- `/auth/callback` exchanges an OAuth code for a Supabase session.
- `DashboardNav` signs the user out through Supabase Auth.
- The checked-in sign-up page does not create a `profiles` row or implement creator onboarding. The checked-in schema has no profile-creation trigger.
- Password reset, explicit email-verification handling/resend, onboarding, and server-side role authorization are not implemented in the inspected app routes. A `role` column exists in the schema, but it is not a complete authorization boundary.

### Existing Routes

| Route                                                 | Current state                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/`                                                   | Landing page with product copy and static sample activity/alert preview.                             |
| `/auth`                                               | Email/password auth and Google OAuth initiation.                                                     |
| `/auth/callback`                                      | OAuth session exchange.                                                                              |
| `/login`                                              | Login route/redirect surface.                                                                        |
| `/[username]`                                         | Public creator page, tipping form, and supporter view. It writes tip rows directly from the browser. |
| `/p/[slug]`                                           | Legacy public project activity page.                                                                 |
| `/dashboard`                                          | Overview that queries projects and stream events.                                                    |
| `/dashboard/profile`                                  | Creator profile editing.                                                                             |
| `/dashboard/tips`                                     | Tip settings and history; UI identifies payment mode as sandbox/demo.                                |
| `/dashboard/alerts`                                   | Alert settings and test behavior.                                                                    |
| `/dashboard/goals`                                    | Donation goal settings.                                                                              |
| `/dashboard/leaderboard`                              | Tip-based leaderboard surface.                                                                       |
| `/dashboard/spin-wheel`                               | Wheel settings and client-side selection behavior.                                                   |
| `/dashboard/raffle`                                   | Local demo participants and client-side winner selection.                                            |
| `/dashboard/subathon`                                 | Timer/settings surface; authoritative donation-driven synchronization is not established.            |
| `/dashboard/voice`                                    | Browser speech/TTS settings.                                                                         |
| `/dashboard/browser-source`                           | Overlay-token and OBS setup UI.                                                                      |
| `/dashboard/widgets`                                  | Widget gallery/configuration surface.                                                                |
| `/dashboard/chat`                                     | Static YouTube chat preview; copied URL points to an unimplemented route.                            |
| `/dashboard/projects/new`, `/dashboard/projects/[id]` | Legacy project and stream-event management.                                                          |
| `/overlay/[token]`                                    | OBS alert overlay subscribed to new tip rows.                                                        |

The requested `/creators`, `/features`, `/pricing`, `/about`, `/faq`, `/register`, `/pay/:creatorSlug`, `/admin/*`, and individual `/overlay/*/:creatorId` routes are not present. Sidebar links also point to missing analytics, Telegram, subscriptions, settings, and admin routes. The chat page's `/overlay/chat/demo` URL has no matching route.

### UI and Design System

- Global CSS defines shared buttons, cards, inputs, badges, alerts, skeletons, and animation utilities.
- Reusable React components currently include `Button`, `Input`, `Card`, and `Badge`, plus `DashboardNav`.
- Most feature UI and styles are implemented in route-level CSS Modules. There is no shared select, textarea, modal, drawer, table, pagination, dropdown, toast, or confirmation-dialog component set.
- Current typography is Inter and Space Grotesk. The global palette emphasizes purple/cyan, includes glass/gradient treatments, and uses larger radii than the requested visual reference.
- The requested navy/teal technical palette, Rajdhani headings, subtle grid, restrained glow, and thin technical-border language are not implemented as a unified system.

## Incomplete or Unverified

- **Payments:** No provider adapter, payment-intent creation, QR/request lifecycle, signed webhook, provider verification, idempotency, or authoritative success transition is present. Payment method controls are not evidence of a payment integration.
- **Donation lifecycle:** Donation insertion is a direct browser-to-database operation. There is no server-validated donation intent or verified event pipeline.
- **OBS/realtime:** The overlay subscribes to inserted tips rather than verified payment events. Its subscription cleanup is returned from an inner async function and is not returned by the React effect callback.
- **Creator lifecycle:** No complete onboarding, payment connection, password recovery, or role-based admin workflow is present.
- **Goals/leaderboard/analytics:** Goal and tip tables/pages exist, but confirmed-payment source data and complete analytics are not established.
- **Spin/raffle:** Wheel/raffle tables exist, but the current raffle page uses local sample state and `Math.random`; the spin page also selects client-side. This is not authoritative or suitable for fairness-sensitive outcomes.
- **Subathon:** A settings row exists, but persisted timer state, server-side conversion, and verified-donation updates are not established.
- **YouTube:** The chat page is static sample content. No OAuth flow, token storage, live chat reader, or matching overlay route exists.
- **Telegram:** A table exists, but no dashboard connection route or delivery service is present. The schema stores `bot_token` as plaintext.
- **Projects:** Project and stream-event pages query `projects` and `stream_events`, which are absent from the checked-in schema.
- **Storage and Edge Functions:** No repository source/configuration was found. Live Supabase buckets/functions were not queried.
- **Live database:** The user reports Supabase and the database are already connected. This audit did not query the live schema, policies, credentials, Realtime publication, storage, or functions.
- **Responsive/accessibility:** Route styles exist, but a systematic mobile/tablet/desktop and accessibility review has not been performed.

## Findings and Risks

1. **Critical: public tip submission can appear paid.** The public page inserts directly into `tips`; the supplied schema defaults `payment_status` to `successful` and grants public inserts. The overlay reacts to inserted tips without checking verified payment status. Do not enable real-money tipping or represent a tip as paid until server-side provider verification is in place.
2. **Critical: overlay token is exposed by public profile access.** The schema permits public profile reads and stores `overlay_token` on `profiles`. The client pages select `*`, including that token. Move overlay credentials behind a dedicated, controlled lookup and rotate any token exposed in a live database.
3. **High: donor data is publicly readable under the supplied policies.** Public `tips` reads expose names, messages, amounts, and payment status; raffle entries are publicly readable. Return only intentionally public fields and confirmed records.
4. **High: sensitive integration credential is plaintext.** `telegram_connections.bot_token` has no checked-in encryption or secret-management boundary.
5. **High: legacy project feature does not match checked-in schema.** Project/event queries target tables not created by `supabase_schema.sql`.
6. **High: role and admin authorization are incomplete.** A profile role field exists, but no admin route or demonstrated server-side role check was found.
7. **Medium: feature availability is overstated by navigation/UI.** Several destinations are missing, and chat, raffle, payment, and some integration surfaces are demos/placeholders.
8. **Medium: UI identity diverges from the requested reference direction.** Existing global styles are purple/cyan and glass/gradient oriented rather than the supplied navy/teal technical system.
9. **Quality baseline:** `npm run lint` currently fails with 11 errors and 27 warnings. Errors include React state updates inside an effect, explicit `any`, an overlay callback ordering rule, an internal raw anchor, unescaped JSX text, and impure random input IDs. Warnings include missing effect dependencies and unused values/imports.

## What Should Change

- Establish the requested design tokens and reusable UI components before restyling feature pages.
- Align routes/navigation to the agreed public, creator, payment, and overlay sitemap; label or remove unavailable destinations until implemented.
- Add complete account lifecycle and onboarding only after defining profile creation and role assignment on a trusted server/database path.
- Define the payment provider and server-side verification contract before changing the public donation flow. Treat all current tip rows as unverified until proven otherwise.
- Reconcile the checked-in schema with the live Supabase schema before migrations. Design RLS and public data access per feature; do not apply the supplied SQL blindly to an already-running database.
- Introduce service/API boundaries for payment intents, webhooks, donation events, integrations, and fairness-sensitive selection.
- Add tests for auth, authorization, payment state transitions, realtime event filtering, and mobile-critical flows as each owning feature is implemented.

## What Must Remain Untouched During Phase 00

- Existing Supabase client construction and environment variable names; do not recreate or replace the working connection.
- Existing auth callback, dashboard pages, and working creator tools; preserve them unless a feature-specific change is approved and tested.
- The live database, RLS, storage, and deployed functions until their actual state has been compared with repository schema and a migration is prepared.
- Environment files and all secret values. Do not copy credentials into source, logs, audit docs, or client bundles.
- Reference products' source code, brand assets, names, or proprietary implementation.

## Verification Performed

- Inspected package scripts/dependencies, app routes, auth clients/middleware/callback, shared UI and global CSS, checked-in schema, and the donation/overlay/raffle/chat paths.
- Confirmed Next.js dev server loaded `.env.local`; environment values were not inspected.
- `npm run lint`: failed with 11 errors and 27 warnings; no unrelated lint fixes were made during the audit.
- No automated tests are configured. No live Supabase schema/policy query or systematic responsive/browser audit was performed.

## Phase 00 Exit and Next Step

- [x] Framework, route, Supabase, auth, component, styling, and schema inventories recorded.
- [x] Incomplete functionality and high-risk data/payment boundaries identified.
- [x] Existing behavior and secrets marked for preservation.
- [x] Lint baseline captured.
- [ ] Live Supabase configuration verified; requires a safe read-only inspection of the existing project.

**Phase 00 audit is complete for repository evidence.** Next, proceed to Phase B (design system and global components) only after confirming the product route/model decisions and addressing the payment and public-data security constraints in the relevant phases. Do not treat the unchecked live-Supabase item as verified.
