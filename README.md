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
- **OBS Browser Source (`/dashboard/browser-source`)**: Secret token URL generator for transparent OBS Studio / Streamlabs integration (`/overlay/[token]`).
- **Widgets Gallery (`/dashboard/widgets`)**: Goal progress bars, scrolling tip tickers, and chat overlay widgets.
- **Public Viewer Tipping Page (`/[username]`)**: Public-facing page where fans can send tips, choose amounts, and trigger live alerts on stream.

---

## 🛠️ Routes Overview

| Route | Description |
|---|---|
| `/` | Landing page with animated live alert preview & feature overview |
| `/login` / `/auth` | Creator sign-in & sign-up (Email & Google OAuth) |
| `/dashboard` | Dashboard overview with total tips, projects, and recent activity |
| `/dashboard/settings` | Account settings: Identity Matrix (display name, username) + security |
| `/dashboard/tips` | Tip settings, currency options, and tip history |
| `/dashboard/alerts` | On-screen alert styling, sound SFX, and test alert trigger |
| `/dashboard/voice-settings` | Alert voice cloning: upload a sample, consent, preview ("Test this voice"), remove |
| `/dashboard/widgets` | Goal bar, chat, and ticker widget URLs |
| `/dashboard/browser-source` | Secret OBS Browser Source token URL & setup guide |
| `/[username]` | Public creator profile |
| `/pay/[username]` | Public tipping form (optional donor voice message on submit) |
| `/overlay/[token]` | OBS Studio transparent alert overlay page (redirects to `/overlay/alerts?token=…`) |

### Voice cloning backend (VoiceStudio)

Alert read-aloud is synthesised by a **self-hosted VoiceStudio instance** reached over a reverse proxy or a Cloudflare tunnel. Configure three server-side variables in `.env.local` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `VOICESTUDIO_BASE_URL` | Public URL of the instance — **not** `localhost`, which only exists on its own machine |
| `VOICESTUDIO_SHARED_SECRET` | Must equal the instance's `OMNIVOICE_API_KEY`; sent as `Authorization: Bearer`. A tunnel host name is one VoiceStudio does not recognise, so a missing or mismatched value is refused on every call |
| `VOICESTUDIO_DEFAULT_VOICE_ID` | Stock voice used when a creator has no consented clone |

Without these, `/api/voice-clones` and `/api/tts/synthesize` answer 503 and alerts fall back to the browser voice.

---

## ⚙️ Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://pqzvqyqnfauwbqvbtmkj.supabase.co).
2. Navigate to **SQL Editor** -> **New Query**.
3. Copy and run the entire contents of [`supabase_schema.sql`](./supabase_schema.sql).
4. Apply the SQL migrations in [`supabase/migrations`](./supabase/migrations) in timestamp order. The ABA PayWay migration adds donation records, payment audit fields, RLS policies, the authenticated leaderboard function, and Realtime publication.

### ABA PayWay Sandbox

Register for a sandbox merchant account in the [official PayWay developer portal](https://developer.payway.com.kh/), then set `PAYMENT_PROVIDER=aba_payway` and configure `ABA_PAYWAY_ENV`, `ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, `ABA_PAYWAY_SECRET_KEY`, and `ABA_PAYWAY_CALLBACK_URL` in the server-side `.env.local`. Use [.env.example](./.env.example) as the variable template; never expose payment credentials through `NEXT_PUBLIC_*` variables or client code. The public checkout uses the ABA QR API and confirms results through the independent Check Transaction API.

---

## 🎥 OBS Studio Integration

1. In StreamKit, go to **Dashboard -> OBS Browser Source**.
2. Click **Copy URL**.
3. In OBS Studio, add a **Browser Source**.
4. Paste your URL, set **Width: 1920**, **Height: 1080**, and check **Control audio via OBS**.
