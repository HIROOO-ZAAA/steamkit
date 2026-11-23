# ⚡ StreamKit — Creator Tipping & Livestream Alert Dashboard

StreamKit is a real-time creator tipping platform and livestream alert dashboard built with Next.js App Router, TypeScript, and Supabase. It includes creator **voice cloning** for alert read-aloud and transparent OBS Studio browser source overlays.

---

## 🚀 Features

- **Creator Identity (`/dashboard/settings`)**: Manage display name and handle via the Identity Matrix with live public preview.
- **Tip Settings & Gateways (`/dashboard/tips`)**: Configure currencies (USD / KHR Riel), minimum tip amounts, preset amounts, and custom thank you notes.
- **Livestream Alerts (`/dashboard/alerts`)**: On-screen alert duration, custom sound effects, animations (bounce, fade, slide, zoom), and test alert trigger.
- **Donor Photo Moderation (`/dashboard/donations`)**: Fans can attach a photo to their tip on the public tip page; it lands in a pending review queue and only shows on the live OBS overlay after you Approve it (StreamNeon-style Live Feed / Audit Queue).
- **Alert Voice Cloning (`/dashboard/voice-settings`)**: Record a short sample (3–15s of clean speech) and StreamKit clones it with a self-hosted [VoiceStudio](https://github.com/debpalash/VoiceStudio) instance. Alerts then read themselves aloud in that cloned voice. Samples longer than 15s need a matching transcript; longer than 20s needs a speech-to-text model. If the cloning backend is unreachable, alerts fall back to the browser's own speech voice rather than going silent.
- **Donor Voice Messages**: Fans can attach a short voice message to their tip on the public tip page. It plays as part of the alert and replaces the template read-aloud for that tip.
- **Widgets Gallery (`/dashboard/widgets`)**: Goal progress bars, scrolling tip tickers, and chat overlay widgets.
- **Public Viewer Tipping Page (`/[username]`)**: Public-facing page where fans can send tips, choose amounts, and trigger live alerts on stream.

## Project structure

```text
src/
  app/             Next.js pages, layouts, and API routes
  components/      Shared UI: ui/, dashboard/, admin/
  config/          App configuration
  lib/             Shared domain logic and integrations:
                   auth/, dashboard/, mediashare/, overlay/, payments/,
                   supabase/, telegram/, voice/
tests/             Node tests for app behavior
supabase/          Database migrations and Supabase configuration
scripts/           Local bridges and verification tools
docs/              Setup, design, migration, and audit notes
```

- Keep page-only components beside their route in `src/app`; put reusable UI in `src/components`.
- Keep business rules and integrations in the matching `src/lib/<domain>` folder; keep API entry points under `src/app/api`.
- Add a hooks folder only when client-side state or behavior needs to be shared across features. StreamKit does not currently have a general `src/hooks` folder.
- Keep database changes in `supabase/migrations`; a migration file does not mean it has been applied to a live database.

---

## 🛠️ Routes Overview

This is a route-family overview, not a complete endpoint list. The current route
files live under [`src/app`](./src/app).

| Route family | Includes |
|---|---|
| `/` | Landing page |
| `/login`, `/auth/*` | Creator sign-in, sign-up, and callback |
| `/[username]`, `/pay/[username]`, `/p/[slug]` | Public creator, tipping, and project pages |
| `/dashboard/*` | Creator overview, settings, tips, donations, alerts, OBS, voice, widgets, goals, leaderboard, media share, subscriptions, games, Telegram, health, and projects |
| `/admin/*` | Admin dashboard and billing tools |
| `/overlay/*` | OBS alerts, feed, chat, goals, leaderboard, cards, games, media share, and other overlays; includes `/overlay/[token]` |
| `/setup-guides/*` | Setup guide index and individual guides |
| `/api/*` | Payment, billing, admin, dashboard, overlay, voice, Telegram, media-share, and health endpoints |

### Voice cloning backend (VoiceStudio)

Alert read-aloud is synthesised by a **self-hosted VoiceStudio instance** reached over a reverse proxy or a Cloudflare tunnel. Configure three server-side variables in `.env.local` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `VOICESTUDIO_BASE_URL` | Public URL of the instance — **not** `localhost`, which only exists on its own machine |
| `VOICESTUDIO_SHARED_SECRET` | Must equal the instance's `OMNIVOICE_API_KEY`; sent as `Authorization: Bearer`. A tunnel host name is one VoiceStudio does not recognise, so a missing or mismatched value is refused on every call |
| `VOICESTUDIO_DEFAULT_VOICE_ID` | Stock voice used when a creator has no consented clone |

Without these, `/api/voice-clones` and `/api/tts/synthesize` answer 503 and alerts fall back to the browser voice.

---

### Local development

1. Copy `.env.example` to `.env.local` only if `.env.local` does not already exist; keep any existing local credentials intact.
2. Fill in the Supabase project URL and publishable key from the intended project. Add server-only payment, Telegram, and VoiceStudio credentials only for features you have configured.
3. Start the existing development server with `npm run dev` and open `http://localhost:3000`.

The example intentionally contains blank credentials and is not a working production configuration. Never paste `.env.local` contents into logs or chat, and never put service-role or provider secrets in a `NEXT_PUBLIC_*` variable.

### Docker deployment

The checked-in Docker stack runs the Next.js app, Redis, a Supabase-to-Redis realtime bridge, and an Nginx reverse proxy:

1. Copy `.env.example` to `.env.production` and fill in the server-side values.
2. Run `docker compose up --build -d`.
3. Check `http://localhost/health` and use `http://localhost/` as the public app URL.

The default Nginx config serves HTTP so it works without a certificate. Put TLS in front of it with the deployment's edge proxy, or replace `nginx.conf` with a certificate-backed config before exposing it directly to the internet. Redis is internal to the Compose network and persists in the `redis_data` volume.

## ⚙️ Database Setup (Supabase)

For an existing project, first compare its live schema and migration history with the repository using [`docs/migrations.md`](./docs/migrations.md). Apply only individually reviewed pending migrations after confirming the target project. Do **not** paste the full migration folder into an existing database or rerun `supabase_schema.sql`; that bootstrap file is only for rebuilding an empty database, and its function definitions can be older than migrated versions.

For a new, empty database only, use the documented rebuild order in [`docs/migrations.md`](./docs/migrations.md). A static migration-verifier pass does not prove that SQL is safe to apply to a live project.

### ABA PayWay Sandbox

Register for a sandbox merchant account in the [official PayWay developer portal](https://developer.payway.com.kh/), then set `PAYMENT_PROVIDER=aba_payway` and configure `ABA_PAYWAY_ENV`, `ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, `ABA_PAYWAY_SECRET_KEY`, and `ABA_PAYWAY_CALLBACK_URL` in the server-side `.env.local`. Use [.env.example](./.env.example) as the variable template; never expose payment credentials through `NEXT_PUBLIC_*` variables or client code. The public checkout uses the ABA QR API and confirms results through the independent Check Transaction API.

---

## 🎥 OBS Studio Integration

1. In StreamKit, go to **Dashboard -> OBS Browser Source**.
2. Click **Copy URL**.
3. In OBS Studio, add a **Browser Source**.
4. Paste your URL, set **Width: 1920**, **Height: 1080**, and check **Control audio via OBS**.
