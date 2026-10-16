# Product Requirements

## Product Goal

Build an original creator platform for public tipping, verified donation events, streaming tools, and transparent OBS browser-source overlays. Existing Supabase Auth and database services are reused; the application must inspect the live schema before proposing or applying migrations. Inspiration is limited to product capabilities and broad visual direction, not copied source, assets, or branding.

## Roles

### Visitor

- Browse the public site and discover creators.
- Open a creator's public profile and tipping page.
- Submit a donation intent with amount, supported currency, optional display name, and message.
- Provide optional media or YouTube details only when the feature is enabled and validated.
- See explicit pending, successful, cancelled, and failed payment states. Success is shown only after server-side/provider verification.
- Receive a confirmation that does not disclose private creator or donor data.

### Creator

- Register, sign in/out, recover an account, retain a Supabase Auth session, and complete creator onboarding.
- Manage public identity, username, avatar, bio, tipping-page copy, supported currencies, and payment setup.
- Configure donation alerts, appearance, duration, sound, TTS, moderation limits, and test previews.
- Create and manage donation goals; view confirmed donations, leaderboards, and date-filtered analytics.
- Configure spin wheels, raffles, and subathon timers. Persist entries/results and perform fairness-sensitive selection on a trusted server.
- Connect/disconnect YouTube and Telegram using least-privilege authorization and protected credential storage.
- Create, preview, and copy revocable OBS overlay URLs; manage widget visibility and settings.
- View donation history and account settings with owner-only data access.

### Admin

- Access a role-authorized platform dashboard.
- Review users, creators, donations, payments, reports, and system health.
- Manage platform settings and feature availability.
- Perform auditable administrative actions with server-side authorization; a client-visible role field alone is insufficient.

## Core User Journeys

### Creator onboarding

Register -> verify/recover account as configured -> create or complete creator profile -> choose username -> configure public page -> connect a supported payment method -> configure alert and OBS overlay -> reach dashboard.

Profile creation and role assignment must be idempotent and trusted. No user-provided role or payment status is accepted as authoritative.

### Donation

Creator tipping page -> validate creator and donation inputs -> create a pending payment intent -> initialize the selected provider -> display provider payment instructions/status -> verify a signed provider callback/webhook -> atomically record the confirmed donation -> publish a deduplicated event -> update alerts, goals, leaderboard, subathon, and analytics.

The browser may request a payment and display provider status, but must never mark a payment successful. Failed, expired, cancelled, duplicate, and delayed callbacks must be safe and visible.

### Creator stream setup

Configure a tool -> preview it -> issue/revoke a scoped overlay URL -> add it as an OBS browser source -> receive only authorized, relevant, confirmed events -> reconnect without duplicate alerts after a network interruption.

### Admin review

Admin sign-in -> server-side role check -> inspect filtered records -> take an authorized, logged action -> show success/failure feedback.

## Functional Requirements

- **Public site:** responsive landing page, creator discovery, feature/pricing/about/FAQ pages, and creator profiles with accessible navigation and clear account entry points.
- **Authentication:** sign-up, sign-in, sign-out, session persistence, OAuth callback, password recovery, email verification when enabled, protected creator routes, and role-based admin access.
- **Onboarding:** eight steps covering creator information, username, profile image, tipping page, payment setup, alerts, OBS, and completion. Save progress and handle validation, retry, and incomplete states.
- **Dashboard:** responsive sidebar/top bar and overview for confirmed totals, recent donations, top donor, active goal, live status, and overlay status. Empty/loading/error/offline states are required.
- **Donations:** server-validated intent, supported currency/amount rules, optional message/media fields, pending/success/failure/cancelled states, provider verification, idempotency, and an auditable donation event.
- **Tipping page:** creator identity, quick/custom amount, currency where supported, optional donor details, message limit, optional validated media/YouTube fields, accessible payment controls, and clear status/confirmation.
- **Alerts/overlays:** creator-controlled alert enablement, threshold, duration, content, animation, sound, TTS, volume, message length, cooldown, test mode, transparent OBS surface, preview, copy/revoke URL, realtime reconnect, and event deduplication.
- **Goals/leaderboard/analytics:** derive totals only from confirmed donations; support creator privacy/display controls and documented date/time periods.
- **Spin/raffle/subathon:** persist configuration and event results; enforce creator ownership; server-side fair selection where applicable; handle locks, limits, rerolls, timer caps, and donation conversion rules.
- **YouTube/Telegram:** explicit connection state, least-privilege OAuth/scopes or bot setup, protected credentials, test/disconnect paths, delivery errors, and no secret exposure to the browser.
- **Admin:** protected overview, users, creators, donations, payments, reports, settings, and auditable system status actions.

## Security, Data, and Operational Requirements

- Supabase RLS is mandatory and tested independently of route protection.
- Public reads expose only intentionally public fields; creator-private, donor-private, payment, and integration credentials remain protected.
- Never place service-role keys, database passwords, provider secrets, OAuth refresh tokens, or bot tokens in client bundles or tracked files.
- Validate and rate-limit untrusted input; validate uploaded files and external URLs; mitigate abuse and XSS.
- Verify provider webhooks/signatures, use idempotency, and keep payment state transitions server-controlled.
- Use Supabase Realtime only for required live surfaces; define authorization, reconnect, ordering, and duplicate-event behavior.
- Every major action provides loading, empty, success, and error feedback; live surfaces also expose offline/reconnect state.
- Support desktop, tablet, and mobile; preserve keyboard access, semantic controls, readable contrast, and reduced-motion preferences.
- Measure query volume, payloads, fonts, images, subscriptions, and animations before optimization.

## Acceptance Gates

- No public/browser action can create a confirmed payment or trigger a paid alert without trusted provider verification.
- Creator and admin ownership/role checks are enforced in backend/database policies, not only in UI routes.
- Sensitive fields are not exposed through public row selection or Realtime payloads.
- Auth, payment state transitions, event deduplication, owner access, admin access, responsive critical paths, and failure states have repeatable tests.
- Each implementation phase is validated before the next major phase begins; live Supabase schema and policies are compared before migrations.

## Explicitly Out of Scope Until Verified

- Selecting a payment provider or asserting support for a specific bank/card API before its credentials, API contract, webhook behavior, and production account are confirmed.
- Treating existing demo rows or client-only success UI as real payments.
- Copying reference products' code, assets, brand identity, or proprietary UI implementation.
- Applying schema changes to the existing Supabase project without a read-only schema/policy comparison and reviewed migration.
