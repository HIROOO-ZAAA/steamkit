# StreamKit Project Memory

## Overview
StreamKit is a real-time creator tipping platform with livestream alerts, OBS overlays, and Telegram integration. Built with Next.js 16 App Router, TypeScript, Supabase.

## Tech Stack
- Next.js 16.3.8 (App Router) + React 19 + TypeScript 5
- Supabase (Auth/Postgres/Realtime)
- TailwindCSS 3.4.19
- Framer Motion, Lucide React
- Teleproto for Telegram local listener
- OBS WebSocket

## Commands
- npm run dev
- npm run build
- npm run lint
- npm run kit-client:bridge

## Branding
- STEAM KIT (formerly NEXUS)
- Dashboard menu bar cleaned (no logo text)
- Dashboard header: "// STEAM KIT COMMAND CENTER"

## Key Routes
- /dashboard
- /[username] (public tip page)
- /overlay/[token] (OBS alerts)
- /dashboard/kit-client

## Important Files
- src/components/DashboardNav.tsx
- src/components/ui/SteamKitMark.tsx
- src/app/dashboard/page.tsx
- scripts/kit-client-bridge.mjs
- src/middleware.ts

## Environment
- .env.local has Supabase + TELEGRAM_API_ID/HASH

## Migrations Are Applied By Hand
- `supabase/.temp` has no `project-ref`: the CLI is not linked to a project.
- `supabase/config.toml` `project_id` is only a local docker label.
- **Schema changes must be pasted into the Supabase SQL editor by hand.**
  Writing a file under `supabase/migrations/` does NOT apply it.
- Consequence: the migrations directory has drifted from the live database.
  `photo_path` / `photo_status` are used by `src/lib/types.ts` and
  `src/app/api/payments/khqr/route.ts`, but the migration that adds them
  (`20261019000003_donation_photo_moderation.sql`, referenced in a types.ts
  comment) was never written to disk. Backfilled idempotently in
  `20261019000009_alerts_donation_voice_messages.sql`.

## Alert Tiers (2026-10-14)
- `alert_settings` is no longer one row per creator. It is one row per
  (creator, tier); `tier_id is null` is the BASE row used when no tier matches.
  Unique index `alert_settings_creator_tier_key` replaces the old `user_id` key.
- Tier minimums are stored per currency (`min_amount_usd` + `min_amount_khr`).
  The overlay cannot do FX conversion -- the KHR rate lives in localStorage on
  the dashboard -- so `streamkit_resolve_overlay` returns every tier as a
  `tiers` jsonb array and the overlay picks the match client-side per tip.
- Gotcha: any new key added to the tier jsonb must match the name `applyTier`
  reads in `src/app/overlay/alerts/page.tsx`. A mismatch is silently dropped,
  not an error. `delay_seconds` vs `text_delay` bit us once already.

## Bakong vs ABA PayWay (2026-10-14)
- `creator_tip_settings.usd_payment_method` / `khr_payment_method` decide which
  provider the tip page posts. They were both `aba_payway`, which meant the
  Bakong API token was dead code. Both are now `bakong`.
- **`ABA_PAYWAY_API_URL` beats `ABA_PAYWAY_ENV`.** `readAbaConfig()` prefers the
  explicit `_API_URL`, so `ENV=production` alongside a sandbox `_API_URL` still
  hits the sandbox. The sandbox accepts `generate-qr` (returns code `0`), so a
  sandbox setup looks healthy right up until a donor pays and nothing ever
  moves. Symptom: every `aba_payway` row sits at `processing` forever.
  `.env.local` is now `ENV=sandbox` to match its host honestly; going live needs
  the production host AND production merchant keys.
- **The Bakong token was never the problem.** Verified against the live API: a
  valid token answers `check_transaction_by_md5` with a *structured* "transaction
  not found" (responseCode 1). An invalid one errors instead.
- Gotcha fixed 2026-10-14: `status/route.ts` verified `toAccountId` against the
  env-level `getBakongMerchant()`, but `khqr/route.ts` issues the QR with the
  per-creator `creator_tip_settings.bakong_id`. Identical values today, so it
  worked by luck; a creator with their own Bakong account would have been sent to
  `review_required` permanently. The status route now reads the same
  `bakong_id`.
- **`BAKONG_API_TOKEN` must exist on Vercel, not only in `.env.local`.** The
  live site had the account id / merchant name / city but not the token, so it
  built valid QRs and then answered every `/status` with
  `awaitingConfirmation: true` -- donors' money would move with no tip ever
  recorded. Diagnose with `vercel env ls`; the QR working proves nothing about
  verification. Fixing it needs a redeploy, since Vercel injects env at build.

## Bakong QR: do not "fix" the SDK (2026-10-14)
`bakong-khqr@1.0.7` is **correct**. Its output must be shipped verbatim.

This project wasted hours "repairing" it. Both repairs were wrong and were
reverted:

1. **CRC range — SDK is right.** `generateKHQR.js:168-169` hashes
   `khqrNoCrc + "6304"`, i.e. including the CRC tag. Verified against a *freshly
   generated ABA PayWay QR* (known-good, scannable): PayWay does exactly the
   same. PayWay's own CRC matched `crc16(body + "6304")` and did **not** match
   `crc16(body)`. EMV's "CRC excludes tag 63" reading is wrong for KHQR.
2. **Tag 54 decimal point — SDK is right.** The SDK writes USD as `"0.05"` /
   `"1.00"` via `toFixed(2)`. PayWay's own QR contains `54` = `"1.00"`. Khmer
   wallets accept this.

**Why the earlier conclusion was wrong:** the ABA QR used for the first check
was pasted through PowerShell, which silently mangled the spaces in
`"ABA Bank"` / `"Chea Lyheng"`. Every CRC variant then mismatched, which looked
like proof the SDK was broken. Always move QR strings to disk as raw bytes and
test those; never retyping or shell-pasting them.

The real cause of ABA reporting "invalid QR code" is the **receiving account**,
not the payload. `creator_tip_settings.bakong_id` = `chea_lyheng1@bkrt` had
never received a payment. Confirm the account ID against the Bakong app before
suspecting code.

## Donor Voice Messages (2026-10-14)
- Donor records up to 30s in the browser; uploaded on submit (never before) to
  the public `donation-voice` bucket via `POST /api/donation-voice`
  (service role, so no anon storage insert policy).
- Plays IMMEDIATELY on the overlay -- deliberately unlike donation photos,
  which are held at `pending` for creator approval.
- `voice_path` is carried donation -> tips by the `tips_copy_donation_media`
  BEFORE INSERT trigger, not at each insert site, because `tips` rows are
  created from four different places.
- Upload guard rails: MIME allowlist, 1.5 MB cap, and a magic-byte check.
  The bucket is public, so a declared `audio/webm` body that was really HTML
  would otherwise be served as a document from a Supabase domain.
- Test it from the dashboard: CUSTOM TEST DONOR MESSAGE card has a recorder.
  `streamkit_insert_test_tip` takes optional voice params
  (`20261019000010`), so TEST can exercise the full loop without paying.
  PREVIEW just plays the local blob.
- `fix_gt.js` at the repo root was deleted (a no-op scratch script; it was
  the last lint error). `npm run lint` is now 0 errors, 54 warnings.

## Donor Voice Recorder (2026-10-14)
- The recorder was REMOVED from the alerts dashboard at the user's request, so
  the TEST button can no longer send a voice message. `/api/alerts/test` still
  accepts `voicePath` and migration `...010` still wires it, but nothing in the
  UI sends those params any more. Real donors on `/pay/[username]` are
  unaffected. The "test the voice loop without paying" path is gone.

## Voice Cloning / VoxCPM (2026-10-14, migration 20261019000011)
- **The old "voice clone" was never a clone.** `resolveVoice()` in
  `src/app/overlay/alerts/page.tsx` only ever looked up a Web Speech API voice
  from the host OS. `voice_settings.cloning_enabled` / `cloned_voice_id`
  existed in the schema since the first alert migration and did nothing.
  Anything describing that as cloning was wrong.
- **Engine split.** `voice_settings.provider` keeps its old one-value meaning
  ('browser'). The new `tts_engine` ('browser' | 'voxcpm') is the real switch
  and defaults to 'browser', so applying the migration changes nothing until a
  creator opts in. `clone_fallback` defaults true: a stopped sidecar degrades
  to the OS voice, never to silence.
- **Sidecar, not a hosted API.** `scripts/voxcpm_server.py` runs VoxCPM2 on the
  creator's GPU on 127.0.0.1:8808, mirroring `scripts/kit-client-bridge.mjs`.
  It needs `VOXCPM_TOKEN` in `.env.local` on BOTH sides or it refuses everything.
  The overlay never calls it directly -- `src/app/api/voice/synthesize` proxies
  -- so the token never reaches a browser.
- **Model stays warm on purpose.** 2B params, ~8GB VRAM, tens of seconds to
  load. It is loaded at startup and held, because an alert is on screen ~7s and
  a per-request load always misses. Requests serialise on one lock.
- **Presets are prompts, not audio.** VoxCPM "Voice Design" -- a text
  description, no reference clip. So no third-party voice is redistributed and
  a creator can get a decent Khmer read-aloud before recording anything.
  `src/lib/voice-presets.ts` owns the ids for the UI, `PRESETS` in the sidecar
  owns the prompt text, and a check constraint in ...011 lists the valid ids.
  **Three places must agree; adding a preset means editing all of them.**
- **The reference clip is private.** Bucket `voice-clones` is `public = false`,
  no storage.objects policies at all. Reached only by the service role. This is
  deliberately unlike `donation-voice`.
- `streamkit_assert_own_voice_clone` is a BEFORE trigger on `voice_settings`
  because a plain FK on `active_clone_id` would let a creator point at another
  creator's clone row and read their voice through the synthesis route.
- Known gap: `speed` has no VoxCPM argument, so the sidecar folds it into the
  style prefix ("slightly faster"). Post-processing would have shifted pitch.

## VoxCPM sidecar: machine state (2026-10-14, verification session)
- **`torch` and `voxcpm` are NOT installed** on this machine. The sidecar has
  never actually synthesised anything here. It boots and serves HTTP fine
  because `torch` is imported lazily *inside* `ensure_model()`, not at module
  level -- so the module imports fine on a machine with no model at all.
  Useful side effect: `subprocess_ffmpeg` / `reference_path` are unit-testable
  without a 2 GB install.
- **`ffmpeg` is now installed** (winget `Gyan.FFmpeg` 9.0.2, resolves via
  `WinGet\Links`). It is a hard requirement, not optional: the browser records
  Opus in WebM and VoxCPM wants 16 kHz mono PCM WAV. Without it
  `subprocess_ffmpeg` returns false and the raw WebM bytes are handed to the
  model as though they were WAV. Verified: Opus/WebM -> 16000 Hz, 1 channel,
  3.00s for a 3s source.
- **This GPU is borderline.** RTX 4060 Laptop, 8188 MiB. VoxCPM2 is 2B params,
  so fp32 weights alone are ~8 GB before activations and before Windows display
  overhead. `voxcpm_server.py` calls `VoxCPM.from_pretrained(...)` with **no
  `dtype`/`torch_dtype`**, so it will very likely OOM here. If anyone runs the
  sidecar on a card this size, add an explicit half-precision dtype first.
- Verified token gate: `/health` returns 503 with `ready:false` when the model
  is not loaded, and 401 for both a missing and a wrong `x-kit-token`.

## Migration 20261019000011 is still NOT applied
Audited on 2026-10-14 and confirmed safe to paste as-is: idempotent
throughout, and the `drop function if exists streamkit_resolve_overlay(text)`
before the recreate is mandatory (the return type grows 4 columns -> 42P13).
`preset_id = 'custom'` is allowed by the check constraint but exists in neither
`VOICE_PRESETS` nor the sidecar's `PRESETS`, and no UI path writes it. Harmless
slack, but writing it would silently yield a generic voice instead of a preset.

## Test setup (2026-10-15)
- **Zero dependencies.** `npm test` is `node --test "tests/**/*.test.ts"`.
  Node 25 strips TypeScript types natively, so no vitest/jest/ts-node.
- **Node requires the `.ts` extension** on relative imports (it is ESM), which
  TypeScript rejects by default. `allowImportingTsExtensions: true` is now in
  `tsconfig.json` -- legal because `noEmit` is already set. Do not remove it.
- **Pure alert logic was extracted** out of the client component
  `src/app/overlay/alerts/page.tsx` into `src/lib/overlay/alert-logic.ts`
  (`parseTemplate`, `highlightText`, `pickTier`, `applyTier` + the
  `AlertSettings` / `AlertTier` types). The page imports them. Behaviour is
  unchanged; only the location moved.
- **`tests/alert-logic.test.ts`, 24 tests.** Covers exactly the two production
  defects from the 2026-10-14 review, plus the cross-currency tier minimums.

## The `applyTier` silent-drop invariant (read before adding a tier field)
`applyTier` copies a tier field only when `key in merged` -- the key must
already exist on the base settings object. It is safe today *only* because
`applyConfig` in the overlay page enumerates every `AlertSettings` key with an
explicit default.

Consequence: **adding a column to the `tiers` jsonb in SQL without also adding
it to `applyConfig` is a silent no-op, not an error.** That is precisely how
`delay_seconds` vs `text_delay` shipped broken. Two tests pin this: one asserts
a misspelled key does not reach the settings, one asserts a base object missing
the key drops the override. Both will need deliberate updating if the design
ever changes to throw on unknown keys.

## Python sidecar setup: the +cpu trap (2026-10-15)
- **`pip install voxcpm` gives you a CPU-only torch.** PyPI's default
  `torch==2.14.1` resolves to the `+cpu` build. `torch.cuda.is_available()`
  returns `False`, the model still loads, `/health` still reports `ready:true`,
  and every synthesis runs on CPU -- minutes per alert against a 25s budget.
  Nothing errors. **Always assert `torch.cuda.is_available()` before believing
  the sidecar is healthy.**
- The fix is the CUDA index, not a version change:
  `pip install --index-url https://download.pytorch.org/whl/cu130 torch==2.14.1`.
  `cu128` and `cu129` top out at 2.11.0 / 2.9.0 -- only `cu130` carries 2.14.1.
  Driver 617.14 and an Ada `sm_89` card are both fine with CUDA 13.0.
- **VoxCPM needs Python <3.13.** 3.14 has wheels for the dependencies so pip
  resolves happily, but it is unsupported. The venv at `.venv/` is 3.12.10 and
  `npm run tts:server` points at `.venv\Scripts\python.exe` -- do not run bare
  `python`, which is 3.14 on this machine.
- **VoxCPM2 loads in bfloat16 by default** (`voxcpm2.py`: `dtype: str =
  "bfloat16"`). `from_pretrained` exposes no dtype argument -- it comes from the
  model config -- so our code cannot override it. This is why 2B params cost
  ~4 GB rather than the ~8 GB the README quotes, and it is the difference
  between fitting an 8 GB card and not.
- **`from_pretrained(optimize=True)` is the default and means `torch.compile`.**
  `voxcpm_server.py` does not pass it, so the sidecar compiles on load. Slow to
  warm and a frequent source of Windows trouble. Consider `optimize=False`.
- **torchaudio is frozen at 2.11.0; torch is not.** There is no torchaudio
  2.14.x on any index, so `pip install voxcpm` resolves torchaudio 2.11.0
  alongside torch 2.14.1. `voxcpm/model/voxcpm.py` imports torchaudio at module
  scope, and that ABI skew **segfaults**: the load dies with exit
  `0xC0000005` (access violation), not a catchable Python exception, right
  after `Running on device: cuda, dtype: bfloat16`. Not OOM -- VRAM was 6.94
  GiB free and bf16 2B params is ~4 GB.
  The coherent pair is `torch==2.11.0+cu130 torchaudio==2.11.0+cu130`; `cu130`
  carries both. Prefer that over torch 2.14.x.
- **`/health` cannot detect a CPU-only torch.** It reports `ready:true` either
  way, so a `+cpu` install looks healthy and every alert just silently falls
  back to the browser voice. `voxcpm_server.py` now prints a loud stderr
  warning when `torch.cuda.is_available()` is false.
## VoxCPM2 will not load on this machine (2026-10-15, investigated hard)
`VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)` dies with
`0xC0000005` (access violation) during model construction. Everything below was
measured, not assumed -- do not re-derive it.

**Ruled out, with evidence:**
- **VRAM.** Not a memory problem. 6.94 GiB free, bf16 default, 2B params ~= 4 GB.
- **The allocator.** A probe allocated 6.83 GiB in clean steps with no error.
- **CUDA 12.8 vs 13.0.** Segfaults identically on torch 2.11.0+cu128 and +cu130.
- **The GPU at all.** It segfaults on `device="cpu"` too.
- **torch 2.14 vs 2.11.** Both fail.
- **The alleged crash site.** faulthandler points at
  `torch/nn/modules/linear.py:109`, which is `torch.empty((out, in))` for
  `nn.Linear(2048, 6144)` -- 24 MiB. Running that exact op standalone on CUDA
  in bf16 succeeds. **The stack is misleading**: an access violation surfaces at
  an arbitrary *later* allocation because memory was already corrupted earlier.

**Still open:** corruption during or after the `audiovae.pth` load, most likely
a native DLL conflict among voxcpm's ~180 dependencies on Windows. Not
`torchcodec` (imports clean; VoxCPM does not reference it) and not FFmpeg 9.0.2
(segfaults with it off PATH too).

**What this means for us:** the sidecar code is verified correct against the
upstream API -- every call, kwarg and the ultimate-cloning pattern matches the
README. It cannot be executed here. `VOXCPM_ENDPOINT` exists for exactly this:
run the sidecar on a machine where the model loads.

- Downloading the model from HuggingFace anonymously took **17m47s** and warned
  about rate limits. A `HF_TOKEN` cuts that substantially. Weights are cached in
  `~/.cache/huggingface/hub/models--openbmb--VoxCPM2` afterwards.
- `faulthandler.enable()` is what turns the segfault above into a usable
  message; without it the run just exits 1 with no traceback.

## Voice library page (2026-10-16)
/dashboard/voice was rebuilt around a card grid: a "Preset Voices" grid and a
"Your Voice Clones" grid, each card with a play button, badges and a "Use this"
action. The settings form (engine, voice source, pitch, speed) stays below it,
because removing it would lose the only place the active voice is chosen.

**Two deliberate differences from a typical voice library:**
- **Preset cards carry no duration badge and no stored sample.** Ours are
  VoxCPM "Voice Design" text prompts, not audio files, so there is no clip
  length to show and the play button synthesises a fresh line on the creator's
  own GPU. A design showing `10s` per preset implies stored sample audio, which
  we do not have and which would mean redistributing third-party voices.
- **Clone audio is not streamable from a URL.** The `voice-clones` bucket is
  private with no storage policies, so `GET /api/voice/clones/[id]/audio` was
  added: it proves ownership with the *user* client, so RLS decides, and only
  then reads the object with the service role. That keeps biometric data off any
  public Supabase domain while still letting a creator preview their own voice.

`voice_clones.duration_seconds` added by migration
`20261016000000_voice_clone_duration.sql`. The upload route always accepted a
`durationSeconds` field and discarded it as "advisory only", which was fine when
clones were a dropdown and not once each card showed a `10s` badge.

No plan gating ("requires the Pro plan") -- `subscription_tiers` exists but no
entitlement check is wired into the page.

## Voice cloning was REMOVED on 2026-10-16 (do not resurrect by accident)
> **Superseded later the same day** — see "Voice clones came BACK as ElevenLabs"
> above. The VoxCPM implementation below is gone; a hosted ElevenLabs version of
> the same creator-facing feature now exists. Keep this section as the record of
> what was tried, not as current state.
The whole voice-clone feature was deleted at the creator's request: the page,
all /api/voice/* routes, scripts/voxcpm_server.py, src/lib/voice/,
src/lib/voice-presets.ts, the nav entry, and the 6 GB .venv.

Migration 20261016000001_remove_voice_cloning.sql drops voice_clones, the
voice-clones bucket, the ownership trigger, and seven columns from
voice_settings (tts_engine, active_clone_id, preset_id, clone_fallback,
cloning_enabled, cloning_consent, cloned_voice_id).

**streamkit_resolve_overlay was RECREATED in that migration, not edited.** Its
return type lost five columns and CREATE OR REPLACE cannot change a return type
(42P13). If you touch that function again, the explicit drop function comes first.

**Still alive and deliberately untouched:**
- voice_settings and browser speech. Alert read-aloud via the Web Speech API
  predates cloning and is driven by tts_enabled on the alert settings.
- Donor voice messages: the donation-voice bucket, /api/donation-voice and
  DonorVoiceRecorder. A different feature entirely.

Every earlier note about VoxCPM, presets, clone_fallback and the sidecar is now
historical. Keep them only as a record of what was tried -- cloning_enabled in
particular was dead from day one and was documented as such long before it was
finally dropped.

## Voice clones came BACK as ElevenLabs, not VoxCPM (2026-10-16)
The VoxCPM sidecar is gone, but the creator-facing *feature* returned a few hours
later with a hosted provider instead of a local GPU sidecar. Do not assume the
`Voice cloning was REMOVED` note below still describes the tree.

- **Page:** `/dashboard/voice-settings` (nav: Streaming Widgets, after Alerts).
  Upload form + list, with a consent checkbox that is load-bearing: it is what
  makes `consent_at` non-null, and a null `consent_at` hides the clone from the
  overlay entirely.
- **Routes:** `POST /api/voice-clones`, `DELETE /api/voice-clones/[id]`,
  `POST /api/tts/synthesize`. Shared provider code in
  `src/lib/voice/elevenlabs.ts`.
- **Samples are never stored here.** The file goes to ElevenLabs and only the
  returned `voice_id` is kept. There is no second copy of biometric audio to
  protect, and no `voice-clones` bucket.
- Migration `20261017000000_voice_clones_table.sql` renames
  `voice_clones.user_id` -> `owner_id`, adds `elevenlabs_voice_id`, makes
  `consent_at` **nullable** (…011 defaulted it to `now()`, so every row looked
  consented the instant it landed), drops `reference_audio_path` /
  `reference_transcript`, and drops the now-broken
  `streamkit_assert_own_voice_clone` trigger, whose body reads the renamed
  column. It is written to be safe whether `voice_clones` exists in the …011
  shape, in the dropped-by-…001 state, or not at all.

**Two things that are easy to get wrong here:**

1. **`/api/tts/synthesize` authenticates with the overlay TOKEN, not a session.**
   It is called from an OBS browser source, which is anonymous by definition. The
   first draft used `auth.getUser()` and would have 401'd on every real request
   while passing any dashboard test. It resolves the token through the same
   `streamkit_resolve_overlay` RPC the overlay uses, so the two cannot drift.
   A caller cannot name an arbitrary `voiceCloneId` — the voice comes from the
   token's creator's consented clones, which is what stops one creator speaking
   with another's cloned voice.
2. **Cached TTS goes in the private `tts-cache` bucket, not `donation-voice`.**
   `donation-voice` is PUBLIC and holds donor recordings; putting creator voice
   clones there would serve biometric audio from a public Supabase domain.

There is no `active_clone_id` / "use this" control: the voice library has no
selection UI to store it in. The route takes an **optional `voiceCloneId`** from
the overlay and reads that row itself with the service role, checking
`.eq("owner_id", creatorId)`; with no id it uses the stock voice. This replaced
an earlier design where the RPC returned an `elevenlabs_voice_ids` array and the
route took the head — deliberately, because that handed a list of provider voice
ids to an anonymous browser source, and the ownership check has to live in the
route where the token is resolved.

**`streamkit_resolve_overlay` is RETURNS TABLE, so supabase-js returns an ARRAY.**
Reading `data.creator_id` directly off the RPC result is `undefined` and the
route 401s on a perfectly valid token. Unwrap with
`Array.isArray(data) ? data[0] : data` everywhere. This bit the v2 draft too.

`donation-voice-route.ts` was offered as a replacement for
`src/app/api/donation-voice/route.ts`. **It was not a replacement** — that route
is the donor voice message *upload*, used by `pay/[username]` and validated in
`api/payments/khqr`. Overwriting it would have broken donor voice messages. Its
TTS half was relocated to `/api/tts/synthesize` instead. A later revision
(`donation-voice-route-v2.ts`) arrived with the same wrong target path and was
applied to `/api/tts/synthesize` as well — it did fix the auth to use the
overlay token, which is what the first draft got wrong.

**Why v2's magic-byte check on the provider's own output is worth keeping:** the
bytes come from ElevenLabs, not a caller, so it is defence in depth against a
proxy or a misconfigured base URL caching an error page as playable audio. It
costs four lines.

## VoiceStudio needs a real API key, and `X-Internal-Key` was never it (2026-10-16)
`POST /api/voice-clones` answered 502 with
`voicestudio_create_403: ... addressed by an unrecognized host name` for every
upload. Two separate defects, one symptom:

- **The credential was fictional.** `.env.local` documented
  `VOICESTUDIO_SHARED_SECRET` as "arbitrary secret the proxy forwards as
  `X-Internal-Key`". There is no proxy (cloudflared forwards straight to
  127.0.0.1:3900) and VoiceStudio has no `X-Internal-Key` — it only reads
  `Authorization: Bearer <OMNIVOICE_API_KEY>` (`core/auth.py`). So nothing was
  being presented.
- **The 403 was reported as bad audio.** Every provider failure became
  `502 "Try a cleaner, longer clip."`, which points at the recording instead
  of the configuration. `VoiceStudioError` now keeps the status and
  `refused` (401/403) maps to 503.

**Why a bearer key and not `OMNIVOICE_ALLOWED_HOSTS`.** A quick tunnel
(`cloudflared tunnel --url`) gets a NEW `*.trycloudflare.com` name on every
restart, so an allowlist entry is stale after the next one. A key survives.
The instance-side key goes in `%USERPROFILE%\.config\omnivoice\env` as
`OMNIVOICE_API_KEY` (loaded by `backend/main.py` at import — **restart the
backend to apply**, the tunnel does not need restarting).

**Setting it also closed a hole.** With no key configured, the host check was
the only thing protecting an instance that is reachable from the internet. With
one, an unauthenticated caller through the tunnel gets `401 API key required`
instead of a 403 that a single allowlist entry away from full access.

**Verified through the live tunnel:** no key → 401; correct key → 200; wrong key
→ 401; `POST /profiles` with a WAV *and* with browser-shaped `audio/webm` → 200
+ `id`; `DELETE /profiles/{id}` → `{"deleted": ...}`. Both probe profiles were
deleted. Note `/v1/audio/speech` is the synthesis endpoint — the old
`/v1/tts` guess in that route's header comment never existed — and
`VOICESTUDIO_DEFAULT_VOICE_ID=demo0001` is the bundled demo profile id.

## VoiceStudio's `verified_own_voice` is NOT a synthesis gate (2026-10-16)
VoiceStudio has `POST /profiles/{id}/consent` (sets `verified_own_voice=1`), and
it is tempting to assume generation requires it, so our consent checkbox would
have to call both our column and that endpoint. **It does not.**

- `services/tts_backend.py` (the engine) has **zero** matches for
  `consent` / `verified_own_voice`; so does `api/routers/openai_compat.py`.
- It *is* checked in `gallery.py:525`, `archetypes.py:137,160` and
  `community.py:729,797` — every place deciding whether a voice may be
  **published or derived** into shared material.
- VoiceStudio's own spec says so: `docs/specs/2026-06-12-elevenlabs-parity-program.md`
  — the consent lock is a "hard prerequisite for agentic v2/v3 … and **gallery
  sharing**", not for TTS.
- The endpoint also requires an uploaded **consent recording**
  (`consent_audio` + `consent_text`, min bytes). Calling it would mean storing a
  second copy of biometric audio — the exact thing the "samples are never stored
  here" design exists to prevent.

So `voice_clones.consent_at` is the operative gate, and it should stay the only
one. **Do not add a provider consent call without new evidence.**

## The alert voice loop is verified end to end (2026-10-16, later session)
`POST /api/voice-clones/[id]/test` (dashboard preview, session auth) and
`POST /api/tts/synthesize` (overlay, token auth) have both now run against the
live VoiceStudio instance through the tunnel. Measured, not assumed:

| Call | Result |
|---|---|
| `/v1/audio/speech` direct, `demo0001` | 200, 1.2–2.8s warm, ~24–35 KB, `ID3` header |
| preview route, no cookie | 401 (gate works) |
| preview route, real session | reaches the provider; reports its message verbatim |
| `/api/tts/synthesize`, bad token | 401 `invalid overlay token` |
| `/api/tts/synthesize`, real token, clone dead | 200, falls back to `demo0001` |
| same text again | 200 from cache, ~1s, no GPU work |
| `/api/tts/synthesize`, foreign `voiceCloneId` | 404 (ownership holds) |

**BOTH stored clones are unusable, for different reasons.** The preview route is
what made this visible; nothing else in the app could tell a creator:
- `ambatukam` (`b598f1a5`) — `Automatic reference transcription needs an
  installed speech-to-text model`, i.e. its clip is over 15s and has no
  transcript.
- `kfiewf` (`a2c1f145`) — `[clone_ref_too_long] Reference audio is 29.7 seconds
  long; a transcript only works up to 20 seconds`.

Both were uploaded under the old form that advertised "30s–2min", which is
exactly the trap the 3–15s guard was added for. They cannot be repaired: the
samples are not stored here, only the provider ids. The fix is to re-upload with
a clip inside the limits. Until then **every alert speaks with the stock voice**,
which is the fallback working as designed, not a silent failure.

### Three real defects found and fixed while verifying
1. **The fallback poisoned the cache.** `/api/tts/synthesize` computed
   `cacheKeyFor(voiceId, text)` *before* synthesis, so when a clone failed and
   the stock voice spoke, the stock audio was written under the **clone's** key.
   The next alert with the same words was served that from cache and the clone
   was never retried — the creator's voice stays dead even after they fix it.
   The key is now computed after synthesis, and `voiceId` is reassigned on
   fallback so the cache key, the reported id and the bytes always agree. Proof
   it was real: the object key in the bucket was `sha256("b598f1a5:" + text)`.
2. **The response named the wrong voice.** Same root cause: it returned the
   clone's `voiceId` after the stock voice had spoken. Anyone debugging "why does
   my clone sound wrong" would have been sent to the wrong place. The response
   now carries `fellBack` and the id actually used. The overlay only reads
   `audioUrl`, so this was a diagnostics trap rather than a user-facing one.
3. **The fallback was unreachable on a slow failure.** The route allowed 10s for
   the clone *and* 10s for the fallback, but the overlay aborts its fetch at
   `SYNTHESIS_TIMEOUT_MS` = 12s. A clone attempt that used most of its budget
   meant the client gave up before the fallback returned, so the alert got no
   audio at all. `GENERATE_TIMEOUT_MS` is now a **whole-request** deadline the
   fallback gets the remainder of. The fallback only ever helped when the clone
   failed fast (~1.5s here).

Two smaller ones: the upload refusal said "under 20 MB" while the limit was
25 MB (now derived from the same constant via `maxUploadMegabytes()`), and the
dashboard's "Ready" badge keyed on `consent_at` alone, so a row the routes
refuse with a 409 still read as Ready. `looksLikeAudio` and the text sanitizer
were duplicated across the two routes; both now live in `lib/voice/voicestudio`.

### Verifying a session-auth route without the password
`auth.admin.generateLink({ type: "magiclink", email })` sends **no** email and
returns `properties.hashed_token`; `POST {url}/auth/v1/verify` with
`{ type: "magiclink", token_hash }` returns a session. The `@supabase/ssr`
cookie is `sb-<project-ref>-auth-token` = `"base64-" + base64url(JSON(session))`,
which the server client accepts without the `user` key. Two traps:
- **`Invoke-WebRequest -Headers @{ Cookie = ... }` silently drops the header**
  (restricted in `HttpWebRequest`) and you get a 401 in 0.1s that looks like an
  auth bug. Use a `WebRequestSession` and add a `System.Net.Cookie`.
- `/auth/callback?code=...` is **not** a shortcut. The redirect lands on
  `localhost`, not `127.0.0.1`, and `exchangeCodeForSession` fails there; it ends
  at `/auth?error=Could%20not%20authenticate%20user` with no cookies set.

Also: **`/v1/voices` does not exist** on VoiceStudio 0.5.7 (404). Voice ids come
from `GET /profiles`; `demo0001` is the bundled one. `.env.example` said
otherwise and has been corrected. And the instance throws transient `503` (and
occasionally `400`) bursts when requests arrive close together — four identical
calls that failed once all succeeded twice afterwards, so a single 502 is not
evidence of a code fault. Re-run before believing it.

## ASR unblocked in three steps (2026-10-16) — verified end-to-end
A cloned reference over 15s needs a speech-to-text model to pick the passage
out of it. None worked here, in three separate layers, each of which fails with
the *same* user-facing message ("Automatic reference transcription needs an
installed speech-to-text model") — so fix them in order and read the log, not
the message.

1. **cuDNN 8 was missing, so every CTranslate2 engine was gated off.**
   `core/cudnn8.py::_ctranslate2_cudnn_status()` returned "cannot load
   cudnn_ops_infer64_8.dll", which makes faster-whisper AND whisperx
   unavailable. Fix is the one the startup log prints:
   `pip install --no-cache-dir --target <venv>/Lib/site-packages/cudnn8_compat nvidia-cudnn-cu12==8.9.7.29`
   (torch here is 2.8.0+**cu128**, so the `cu12` wheel is right). Verify with
   `ctranslate2_cudnn_status() -> (True, "cuDNN 8 loadable")`, then restart: the
   "CTranslate2 ASR engines unavailable" warning must disappear.
   **`--target` matters** — it keeps cublas/nvrtc out of the real site-packages
   so torch's own CUDA 12.8 libs cannot be shadowed.
2. **`_find_cached_reference_asr()` never touches the network** ("Nothing here
   touches the network"). It wants a *local* Whisper snapshot in the HF cache.
   Pre-place one with `snapshot_download("openai/whisper-small")`. Only the
   repos in `_reference_asr_repos()` are auto-found (the two `openai/whisper-*`
   defaults); **any other repo needs `OMNIVOICE_PYTORCH_ASR_MODEL` pointed at
   the snapshot directory**, which is the branch checked first.
   `small` not the default `large-v3-turbo`: this ASR runs *during* synthesis
   while OmniVoice is already resident on a 6.9 GB card.
3. **Restart the backend.** env file changes only apply at import.

Verified: 29.7s clip, no transcript → ASR picked a passage → **HTTP 200,
116 KB real MP3, 15s**.

**Two costs to know about:**
- `snapshot_download` with no `allow_patterns` pulled flax + tf + pytorch
  duplicates: **3.7 GB for a 922 MB model**. Only `model.safetensors` is read.
- **`C:` was down to 1.4 GB free** and pip died with `Errno 28` unpacking a
  719 MB wheel into `%TEMP%`. Set `TEMP`/`TMP` to a D: path and use
  `--no-cache-dir` for any pip work. This has bitten twice now; check free
  space before installing anything.

**Still cosmetic:** the save-time helper still logs "no installed ASR model
available" because it resolves engines through the Model Catalogue, which has
no ASR engine *selected*. Implicit cloning (synthesis time) works regardless,
because it reads the snapshot directly. Do not chase the catalogue over this.

**PowerShell gotcha that cost a debugging cycle:** `ConvertTo-Json` on a
`Get-Content` result serialises the PSObject's extended properties, so `voice`
went out as `{"value":"...","PSPath":"...","PSDrive":{...}}` and pydantic
rejected it with a confusing "voice object must be {\"id\": ...}". Cast to a
plain string: `[string](Get-Content -Raw $f).Trim()`.

## Do NOT diagnose Supabase with curl and believe it (2026-10-16)
**I got this wrong first and nearly reported it as fact.** Curl against PostgREST
says the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT is dead:

- `apikey: <jwt>` → `401 {"message":"Invalid API key"}`
- `Authorization: Bearer <jwt>` → `401 PGRST301 "None of the keys was able to decode the JWT"`

**But the app's own client works.** Running the same four operations through
`@supabase/supabase-js` — exactly what `createAdminClient()` builds — all
succeed: the rate-limit RPC returns `true`, `streamkit_resolve_overlay` returns
`[]`, `voice_clones` selects real rows, and storage answers a signed-url request
with "Object not found" (correct for a missing object, not a key failure).

So the gateway accepts the key from supabase-js and not from hand-rolled curl.
**Verify with the project's own client before calling a key dead**, and delete
the probe script afterwards. Corollary: `/rest/v1/` (the OpenAPI spec, the only
way to list a table's columns) answers `Secret API key required` to the legacy
JWT — that is an endpoint-level rule, not evidence the key is invalid.

**Column-by-column probing still works** for schema questions, and resolves
columns definitively:

```
curl -H "apikey: <publishable>" "<ref>/rest/v1/voice_clones?select=owner_id&limit=1"
```
→ `200 []` = the column exists; → `42703 column ... does not exist` = it does not,
and Postgres's `hint` often names the real column. This resolves columns
definitively; it cannot see rows (RLS), NULLability, or policies. Use the
project's own service client when you need rows.

## Voice clones: two migrations were pasted out of order (2026-10-16)
`POST /api/voice-clones` cloned successfully upstream and then answered
`503 "Could not save that voice. Try again."` — the Supabase insert, not the
provider. Cause: `20261017000004_voice_voicestudio_backend.sql` was applied (it
ADDS `voicestudio_voice_id`) but `20261017000000_voice_clones_table.sql`
(which renames `user_id` → `owner_id`) was not, so the live table is the …011
shape plus one column.

**Probing columns one at a time is worth doing before pasting anything** — the
answer ("`owner_id` does not exist, and Postgres suggests `user_id`") is a
one-request check and settles which migration is actually missing.

**Fixing the rename alone would have moved the failure, not removed it.** Three
more landmines sit behind it, all invisible from the error:

1. `reference_audio_path text not null` — no code path writes it any more, so
   the insert 23502s once `owner_id` resolves.
2. The RLS policy is keyed on `user_id`. A policy naming a missing column is
   not "too permissive", it **raises on every statement** — so the rename breaks
   reads and writes too unless the policies are replaced in the same paste.
3. `streamkit_assert_own_voice_clone()` (BEFORE trigger on `voice_settings`)
   reads `voice_clones.user_id`, so the rename breaks every voice_settings write.

`20261017000002_voice_clones_owner_id.sql` fixes all four and is idempotent. It
deliberately does **not** recreate `streamkit_resolve_overlay` the way the
ElevenLabs migration does: that snapshot predates the alert-tier rework, and the
live function is the only authority on its own return type.

**A rename + NOT NULL can strand rows**, so the migration refuses to finish if
any row has no resolvable owner and tells you to delete them first.

**The orphan cleanup worked:** after the failed insert the route deleted the
upstream VoiceStudio profile, and `/profiles` was left with only `demo0001`.

## Alerts now speak with the creator's clone (2026-10-16)
The overlay never called `/api/tts/synthesize` — `speak()` only ever reached
`speakWithBrowser`, so a clone was stored and then never used. This is the same
"dead from day one" pattern as `cloning_enabled`: the backend was complete and
nothing was wired to it. Fixed by making `speak()` try the route first and fall
back to the OS voice, and by having the route pick the voice from the creator's
own data when the caller names none: **newest clone with `consent_at` AND
`voicestudio_voice_id` non-null**, else `VOICESTUDIO_DEFAULT_VOICE_ID`.

**Both conditions are load-bearing.** `consent_at` means the sample cleared
consent; `voicestudio_voice_id` means the provider actually returned an id. A row
missing either is silently unusable rather than an error the creator can act on.
Verified against the live DB: the auto-pick query returns the live clone id, and
the whole chain answers 200 with real MP3 in the creator's cloned voice.

**Testing trap: there are TWO overlay credential rows, so an arbitrary token
belongs to a creator with no clones** and the route correctly falls back to
`VOICESTUDIO_DEFAULT_VOICE_ID`. That reads as "the feature is broken" when it is
actually the *fallback* working. Always pick the token whose `creator_id` owns a
`voice_clones` row before concluding anything from a synthesis test.

The overlay keeps the token at module level (like `cachedVoices`) because one
page serves one creator and `speak()` is a module function the queue calls
without props; it is only assigned after the config load proves the token valid.

**Warm synthesis is 1.45s**, comfortably inside `GENERATE_TIMEOUT_MS` (10s). The
first call after a restart is ~40s (model load) and must not go through the
Cloudflare tunnel: the quick tunnel 524s anything over 100s, which is what made
the missing weights look like an auth failure. **Warm the model against
`127.0.0.1:3900` directly.** (Re-measured 2026-10-17: 2.9-6.0s warm, not 1.45s
— see the GPU worker pool section below.)

## OmniVoice reference audio needs a transcript, and this box has no ASR (2026-10-16)
`k2-fsa/OmniVoice` auto-transcribes the reference clip, so synthesis failed with
"Automatic reference transcription needs an installed speech-to-text model".
The bundled `demo0001` works because it ships with a `ref_text`. Policy
(`omnivoice/utils/audio.py`, `omnivoice/models/omnivoice.py`):

- with a transcript: up to **20s** (`CLONE_REF_TEXT_MAX_SECONDS`)
- without one: up to **15s** used as-is; longer needs ASR to pick the best
  passage, up to 75s (`CLONE_REF_MAX_WINDOWS` = 5 × 15s)

**The upload form advertised "30s–2min" — backwards**, and a too-long clip is
*accepted at upload* and only refused when an alert tries to speak it. Now
3–15s, measured in the browser (`sampleDuration`), because the server cannot
decode the container cheaply. `POST /profiles` accepts `ref_text`, which the app
never sent: sending one removes the ASR dependency entirely (and a transcript
improves fidelity), at the cost of the creator typing the words.

Two blockers remain for cloned voices specifically: no ASR model installed (the
log also shows CTranslate2 engines are unusable on this GPU — missing
`cudnn_ops_infer64_8.dll` — so `OMNIVOICE_ASR_BACKEND=pytorch-whisper` is the
route), or a transcript field in the form.

## PowerShell here writes UTF-8 WITH A BOM (2026-10-16)
Set-Content -Encoding utf8 and [System.IO.File]::WriteAllText default to a BOM
on this machine PowerShell 5.1. It broke next build with the useless message
"Error parsing package.json file". Use instead:
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
## Caches live on D:, not C: — pip included (2026-10-16, extended)
C: was down to 7.6 GB free. Both big caches now live on D:, repointed
persistently so new shells need no env setup:
- `HF_HOME = D:\hf-cache` (User environment variable) -- VoxCPM2 weights
- `npm config set cache D:\npm-cache --global` -- this one was **11.08 GB**

C: free went 7.6 -> 23.2 GB.

**pip was the third one, and it was still on C:.** `pip cache dir` reported
`C:\Users\User\AppData\Local\pip\cache` holding **6.81 GB** in 2830 files. That
is what killed the cuDNN 8 install with `OSError: [Errno 28] No space left on
device` -- pip unpacks a 719 MB wheel into `%TEMP%` on C:, which had 1.4 GB
free. C: went back down to 1.4 GB.

Now:
- `pip config set global.cache-dir D:\pip-cache` writes `pip.ini`, so it applies
  **immediately, everywhere, in any already-running shell** -- no restart, no env
  var. Verified with `pip config list`.
- `TEMP` / `TMP` set to `D:\temp` as **User environment variables**, so new
  terminals get them. Caveat: processes spawned from an already-open shell
  inherit the *parent's* environment block and keep the old value -- the Next dev
  server and the VoiceStudio backend both need a restart to pick up D:\temp.
- `pip config set global.timeout 120` -- the default 15s read timeout is what
  produced the repeated "The read operation timed out / Trying to resume download"
  lines on this ~5.4 MB/s link.
- Moved the existing cache with `robocopy /MOVE` (2830 files); pip's cache is
  plain content-addressed files, so **no symlink hazard** unlike the HF cache.

C: free went 1.4 -> **8.1 GB**.

**Never move a HuggingFace cache with `robocopy /MOVE`.** The HF layout uses
symlinks (`snapshots/<rev>/<file>` -> `../../blobs/<hash>`). Robocopy cannot
create symlinks, so it replaces each with a 0-byte regular file and deletes the
real blob. The cache still looks present and reports a plausible total size
while every model file is empty, and it fails later as a confusing load error
rather than as a move error. Copy, verify resolved sizes with Python `stat()`
(which follows links), then delete the source. PowerShell `Get-Item` reports 0
for these symlinks too, so it cannot verify them.

Keeping the xet chunk cache at `D:\hf-cache\hub\blobs` made the re-download take
seconds instead of 17m47s. Do not delete it.

## `.venv` breaks `npm run lint` (2026-10-16)
Creating `.venv/` for the VoxCPM sidecar put a Python `site-packages` tree inside
the repo. `eslint.config.mjs` `globalIgnores` did not list it, so `npm run lint`
walked every file inside and reported **728 errors / 54,402 warnings** from
third-party packages. `.venv/**` is now in `globalIgnores`.

If lint ever explodes to five figures, suspect an unignored build directory
before suspecting your own changes.

## Server-authoritative draws (2026-10-16)
Migration `20261015000002_draws_server_authoritative.sql`. All three clients now
call the database instead of `Math.random()`:
- `streamkit_draw_raffle_winner` -- row-locked, refuses a re-draw, records the
  winner and sets status 'completed'.
- `streamkit_spin_wheel` -- token-authenticated, one spin per tip via a partial
  unique index, recorded in `spin_wheel_spins`.
- `streamkit_spin_wheel_config` -- the slice list, so the overlay stops
  rendering its own hardcoded wheel.

**The slice-drift trap.** `src/app/overlay/spin-wheel/page.tsx` had a hardcoded
`SLICES` array completely unrelated to `spin_wheels.slices`. A server-side index
against a locally-rendered wheel would point at the wrong label on screen while
the audit trail recorded a different one. `streamkit_spin_wheel` therefore
returns the slice list with the draw, and the overlay renders whatever the
server last spoke about. **If the slices ever stop round-tripping, the rendered
wheel and the recorded result silently disagree.**

**Raffle RLS was incomplete.** The base schema let anyone INSERT
`raffle_entries` and everyone SELECT, but gave the raffle's owner neither DELETE
nor UPDATE -- so "Reset all entries" could only ever clear local React state,
and `entries_count` (the weight the draw actually uses) could never be raised.
Both policies added in this migration.

**Not yet verified:** none of this has run against a live database.

## Supabase CLI is not installed (checked 2026-10-15)
No `supabase` binary on PATH and no `supabase/.temp/project-ref`. Linking the
CLI (plan item 4) needs an install plus the user's project ref and access
token, so it is still blocked on them. Migrations remain copy-paste.

## The alert voice now speaks end to end in a browser (2026-10-17)
Full loop observed for the first time — a real tip, a real browser, the
creator's own cloned voice. Read `PROJECT_MEMORY.md` below for the root causes;
this section is how it was verified and how to verify it again.

**Harness:** Chromium over CDP, headless, no `--autoplay-policy` flag — which
makes it *stricter* than OBS, so what passes here passes there. Navigate
`/overlay/alerts?token=…`, inject a tip with the service client, and read the
page's own `console.warn` lines. The page logs enough to diagnose itself:
`tip queued` -> `drain` -> `tts request chars=N` -> `tts response status=…` ->
`playback start <origin+path>` -> `playback=ended|error|timeout`.

**Observed on a clean run:**

```
tip queued depth=1
drain depth=1
tts request chars=115
tts response status=200 audio=yes
playback start https://…supabase.co/storage/v1/object/sign/tts-cache/8f8960fc….mp3
tts …mp3 playback=error error=NotAllowedError
tts element playback=error; retrying through Web Audio
```

**Three things this caught that HTTP-only testing never could:**

1. **A suspended `AudioContext` reports success.** The probe recorded
   `contexts: [{ state: "suspended" }], decode: []` while the page believed it
   had spoken. `decodeAudioData` resolves and `onended` fires on a suspended
   context, so *every* success signal is green and the speakers stay silent.
   Nothing in the app could have detected this. Fixed: prime the context with a
   one-sample buffer before `resume()` (a muted output keeps it suspended), and
   log the context state next to every playback outcome.
2. **`resume()` does not always settle.** With no audio device it never
   resolves, and the decode happens BEFORE `playViaWebAudio` arms its timeout —
   so an unbounded await hung the alert queue forever, reintroducing the exact
   stall `audio-playback.ts` was written to prevent, upstream of it. Now bounded
   by `AUDIOCONTEXT_RESUME_MS` (1.5s).
3. **`sound_url` effects hit the same autoplay refusal as the voice** and, unlike
   the voice, have no Web Audio path — they are just dropped with a log line.
   Not fixed; the voice is what matters here and OBS normally grants playback.

**Do NOT leave overlay tabs open while testing this.** Each one polls the same
creator and fires its own synthesis per alert, and the GPU pool has one worker.
Six forgotten tabs produced `worker pool is saturated (0 running, 1 already
queued)` that looked exactly like an app bug and was entirely the harness. The
probe now closes its own tab; `json/close/<id>` for any strays.

## VoiceStudio has ONE GPU worker, and aborting a request does NOT cancel it
This is why "the voice sometimes stops reading" at all. It was not found by
reading code; it came out of a real browser alert on 2026-10-17.

The instance serialises synthesis on a single worker pool and says so when it
refuses:

```
the local GPU worker pool is saturated (0 running, 1 already queued on
1 worker(s)). Nothing was started, so this request is safe to retry as-is
in about 5s. To raise throughput, run fewer concurrent requests, or set
OMNIVOICE_GPU_WORKERS ...
```

**The trap: `AbortController.abort()` on our fetch does not stop the work.**
VoiceStudio keeps synthesising for whoever walked away, and that job holds the
only worker for its full natural runtime. So a chain of

> clone attempt times out -> we abandon it -> job still running -> fallback is
> rejected 429 without starting -> fallback times out -> abandoned too -> ...

permanently wedges the voice. Every later alert 504s. **This is the single most
important thing to know about this deployment.** `OMNIVOICE_GPU_WORKERS` is not
the fix: a second worker means a second resident model on a 6.9 GB card that
already holds OmniVoice.

Three changes in `src/app/api/tts/synthesize/route.ts`, all from measurements:

1. **A timeout no longer retries.** `withTimeout` now raises a distinct
   `TimeoutError`, and the handler returns 504 straight away instead of trying
   the stock voice. A timed-out attempt means the worker is still busy with our
   own abandoned job; retrying is what compounded it. One alert loses its
   voice, the next ones are fine. A *provider error* still retries, because an
   answered error leaves nothing running.
2. **No per-attempt reserve.** `FALLBACK_RESERVE_MS` existed only to stop the
   fallback being handed a negative budget. With the budget floored at
   `MIN_ATTEMPT_MS` (1.5s) and the retry only reached after a fast failure,
   the reserve bought nothing and cost the clone 4s it needed. Removed.
3. **A process-wide single-flight chain** (`onTheProvider`) so two concurrent
   callers queue at *our* end instead of on the GPU. Best effort — it does not
   coordinate across serverless instances, which is why (1) still matters.

## The single-flight gate must live in the PROVIDER, not in one route (2026-10-17)
First placed in `api/tts/synthesize/route.ts`, which was wrong. There are **two**
callers that synthesise — the overlay route and the dashboard's clone preview
(`api/voice-clones/[id]/test`) — and a gate only one of them respects is not a
gate.

The symptom was visible in the dev log while previewing a clone on
`/dashboard/voice-settings`:

```
POST /api/voice-clones/70528fa1…/test 200 in 46s
POST /api/voice-clones/03b06d8d…/test 502 in 91s
POST /api/voice-clones/70528fa1…/test 200 in 26.7s
…saturat (0 running, 1 already queued on 1 worker(s))
```

46s and 91s for a *warm* synthesis, while the overlay was also mid-alert. Both
routes hit the same one-worker pool with nothing between them.

`onTheProvider()` now lives in `src/lib/voice/voicestudio.ts` and wraps
`synthesizeVoiceStudioSpeech`, so **every** synthesis funnels through one chain
regardless of which route asked. **When adding a third caller, do not add a
second gate — this is the gate.**

Still true: it is per-process and does not coordinate across serverless
instances, which is why a timeout still must not retry.

## NEVER run `npm run build` while `npm run dev` is serving OBS (2026-10-17)
This cost a whole diagnosis cycle and it was self-inflicted. **Do not build
while the dev server is running.**

Next 16 writes both layouts into `.next`: production into `.next/static` and
`.next/server`, dev into `.next/dev/static`. A production build therefore
**overwrites the dev server's chunk directory underneath it.** The dev server
keeps serving happily — it holds chunks in memory — but every
`/_next/static/chunks/...` it hands out is gone from disk:

```
status=200   <- HTML is fine
chunks present=0 missing=22   <- and no JavaScript exists
```

The page renders server HTML and then does nothing. **No errors, no logs, no
overlay** — which is indistinguishable from a dead backend. OBS was affected
exactly this way: it kept logging `Browser 5` at 13:10, then went completely
silent while every later entry was from `Browser 4`.

**Verify before trusting any "the overlay is dead" conclusion:** fetch the chunks
the server hands out and check them, rather than looking at the disk:

```powershell
$r = Invoke-WebRequest "http://127.0.0.1:3000/overlay/alerts?token=$TOKEN" -UseBasicParsing
[regex]::Matches($r.Content,'/_next/static/[^"'' ]+') | % { $_.Value } | select -Unique |
  % { try { (Invoke-WebRequest "http://127.0.0.1:3000$_" -UseBasicParsing).StatusCode } catch { "FAILED $_" } }
```

Check over HTTP, **not** on disk: Turbopack serves dev chunks from memory, so a
`Test-Path` against `.next\static` reports them missing even on a perfectly
healthy server. That false negative cost time too.

Recovery is `Stop-Process` the dev server, `Remove-Item .next -Recurse -Force`
(they are genuinely interleaved), then `npm run dev`. OBS still has to reload
its source afterwards.

## OBS logs ONLY uncaught errors — every diagnostic here was invisible
Verified against a live obs-browser 2.26.9 session on 2026-10-17. The log at
`%APPDATA%/obs-studio/logs/*.txt` contained **seven** uncaught errors from
`/overlay/alerts` and **zero** `console.warn` lines — including every one of the
`[alerts] …` diagnostics this feature emits.

So the entire diagnostic surface of the alert voice was invisible in the one
place a creator will ever look, which is a large part of why "the overlay is
silent" has been so hard to explain from the outside.

`playbackLog()` now escalates to `console.error` for any outcome other than
`ended`, and `alertFault()` does the same for the two facts that decide whether
an alert spoke at all:

- `audio output available=false — nothing this page plays will be audible`
- `tts synthesis returned no audio; using OS voice`
- `the clip finished but the audio context never started…`

Routine progress (`tts request chars=`, `poll new=`, `realtime SUBSCRIBED`) stays
on `console.warn` on purpose: it fires every few seconds and would drown the log.
**When adding a diagnostic here, ask whether a creator would need it without
devtools. If yes, it is `alertFault`, not `console.warn`.**

## OBS test setup on this machine (2026-10-17)
Scene collection `Untitled`; canvas 1920x1080; current program scene **Game**.
The live alerts overlay is the browser source **`Browser 5`**:

```
http://localhost:3000/overlay/alerts?token=ef6866a2-35f4-4f61-8e43-f5ccd006b0db
```

`Browser 2` points at the **same URL** and lives in scenes `start stream` and
`Scene 2`. Both must not be visible in the same scene — two overlays means two
syntheses per alert, against a one-worker GPU pool. This is not hypothetical: an
earlier session mistook exactly that for an application bug.

All five browser sources point at `localhost:3000`, i.e. the **dev** server, so
`npm run dev` must be running for the overlay to work at all. `obs-browser` is
2.26.9 on CEF 127.

**Historical, now fixed:** the log shows every overlay being CORS-blocked from
Supabase between 00:10 and 00:42 (`No 'Access-Control-Allow-Origin' header`).
Supabase answers all four origins correctly now (verified: localhost, 127.0.0.1,
:3100 and the production host each get a matching `ACAO`), and no CORS error has
been logged since 00:42. If it ever returns, check the project's allowed origins
in Supabase before touching the app.

Also in the log, unrelated to StreamKit's own code but confusing when reading it:
`Browser 4` spams `Internal Next.js error: Router action dispatched before
initialization`, and there are `Uncaught TypeError: Cannot read properties of
null (reading 'appendChild')` plus `SyntaxError: Identifier 'obsCSS' has already
been declared` entries from OBS's own injected stylesheet.

## `ref_text` is now REQUIRED on a clone (2026-10-17)
VoiceStudio transcribes the reference clip itself when no transcript is
supplied. `GET /profiles` shows both stored clones have `"ref_text": ""`, so
every single synthesis ran Whisper on the GPU next to a resident OmniVoice —
and that path fails outright on this card:

```
.../omnivoice.py:1037 in create_voice_clone_prompt
    ref_text = self.transcribe((ref_wav, self.sampling_rate))
torch.AcceleratorError: CUDA error: unknown error
```

Measured side by side, same clip, same line, three runs each:

| clone | synthesis latency |
|---|---|
| with `ref_text` | 2.9s / 3.4s / 3.6s |
| without `ref_text` | 3.7s / 4.8s / 6.0s |

That gap is the difference between finishing inside the alert budget and timing
out — and a timeout is what orphans the GPU worker. So `ref_text` is now
required by `POST /api/voice-clones` (400 with an explanation) and by the form,
instead of being an "optional accuracy" field. A transcript also raises the
sample cap from 15s to 20s.

**The two existing clones still cannot be repaired** — samples are never stored
here, only the provider id, and `ref_text` lives upstream. They must be
re-uploaded. Until then `kdit` works but is slow enough to be marginal.

### `npm run voice:transcribe` exists, but its output is NOT trustworthy here
`scripts/voice-transcribe.mjs` borrows VoiceStudio's venv (transformers + torch
already installed) to run the cached `openai/whisper-small` on CPU, so no
dependency is added and nothing is downloaded. It works — and on the samples in
`~/Downloads` it produced **confident, fluent, wrong English**:

| file | duration | whisper output |
|---|---|---|
| `ambatukam.mp3` | 10.3s | "I'm about to come out!" |
| `villager-ambatukam.mp3` | 10.3s (same audio) | "I'm about to come out!" |
| `Ambasing full. Ft dreambull.mp3` | 29.7s | "Yes, Chip. Yes, thank you so much…" |

Two files that are the same audio returned the same sentence, and the 29.7s clip
returned English text that no one would have said. **These are hallucinations,
not transcriptions.** The samples appear to be Khmer, and whisper-small on a
short clip will invent plausible English rather than admit it cannot tell.

So do not paste this output into the transcript field. The creator has to supply
the words by listening to their own sample. The script is kept because it is
still the right tool for a clip it *can* handle, and because running it made the
failure obvious in seconds instead of after an upload.

**The two samples that matter are in `~/Downloads`:** `ambatukam.mp3` (10.3s, in
range) and `villager-ambatukam.mp3` (the same 10.3s audio). `Ambasing full. Ft
dreambull.mp3` is 29.7s and must be cut to 3-15s first.

`Ambasing full. Ft dreambull.mp3` is 29.7s and over the engine's 15s limit for a
clip with no transcript anyway — cut it to 3-15s of clean speech first.

## `ended` is NOT proof that anything was audible (2026-10-17)
The most dangerous class of bug in this feature, because every signal says it
worked. Measured in a real browser alert:

```
tts …mp3 playback=ended            <- the page believes it spoke
contexts: [{ state: "suspended" }]  <- nothing ever reached the speakers
```

`HTMLAudioElement` reports `ended` whether or not an output device is attached,
and a **suspended `AudioContext` decodes the buffer, advances its clock and
fires `onended` exactly the same way.** So the queue believed it had spoken, no
alert was blocked, no error was logged, and the stream heard silence.

Three consequences, all now handled in `src/app/overlay/alerts/page.tsx`:

- **`ensureAudioOutputKnown()` probes once, BEFORE any clip plays**, with a
  one-sample silent buffer, and caches the answer. The ordering is the whole
  point: probing *afterwards* was tried first and made the alert **audible
  twice** (`playback=ended` from the element, then the same clip again through
  Web Audio). Exactly one path may play the clip.
- **A context that never started is a failure, not a success.** `playAudioUrl`
  returns false in that case so `speak()` falls through to the OS voice. Silence
  is not a fallback.
- **`resume()` does not always settle.** With no audio device it never resolves,
  and the decode happens *before* `playViaWebAudio` arms its timeout, so an
  unbounded await hung the queue forever — reintroducing upstream the exact
  stall `audio-playback.ts` exists to prevent. Bounded by
  `AUDIOCONTEXT_RESUME_MS`.

**Do not test playback with headless Chrome alone.** It has no audio device, so
every run reports a suspended context and it is impossible to tell a real
failure from the environment. Launch with
`--autoplay-policy=no-user-gesture-required` *and* expect `context=running`;
`audio output available=true` in the log is the line that means sound is real.

**`sound_url` effects have the same refusal** (`playback=error
error=NotAllowedError`) and now go through the same Web Audio fallback via
`playSoundEffect`. Fire-and-forget on purpose: it is not awaited, because a
sound effect that starts slightly late is unnoticeable whereas awaiting it puts
a third audio device in front of the spoken message.

## `npm run dev` could not hydrate any overlay page (fixed 2026-10-17)
Two causes, stacked, both worth knowing:

- `src/middleware.ts` matched `/_next/hmr`. It excluded `_next/static` and
  `_next/image` but not the websocket upgrade, so the middleware ran
  `supabase.auth.getUser()` on it and answered with `NextResponse.next()`,
  which cannot be an upgrade. Chrome: `net::ERR_INVALID_HTTP_RESPONSE`.
- Next 16 also blocks cross-origin requests to its own dev resources, and the
  dev server listens on `localhost` while OBS URLs are built from `127.0.0.1`.
  Fixed with `allowedDevOrigins: ["127.0.0.1", "localhost"]`.

Symptom: **every client overlay page rendered its server HTML and then nothing.**
No effects, no Supabase request, no console output — which looks exactly like a
dead backend and is not one. Confirmed by `npm run build && next start`, where
the same page worked immediately. If an overlay "does nothing" in dev, check
hydration before touching the API.

Side effects: proxy time on overlay routes fell from ~300ms to ~5ms (the auth
RPC is no longer on every `_next` request), and `middleware` is deprecated in
Next 16 — renamed to **`src/proxy.ts`** exporting `proxy()`, same behaviour.


docs: record the settings-save failure and what it cost

Two things worth not rediscovering.

## alert_settings.tts_volume made every save fail

The Alerts settings page writes `tts_volume`. Migration
20261019000013_alerts_tts_volume.sql adds the column, and that migration has to
be pasted into the Supabase SQL editor by hand like every other one here. Until
it is, PostgREST rejects the WHOLE write:

  Could not find the 'tts_volume' column of 'alert_settings' in the schema cache

One optional column out of twenty-three, and it took duration, template, TTS
toggle, colours, layout and everything else with it. Reproduced directly
against the live database: the exact dashboard payload answers 400, the same
payload without `tts_volume` answers 200.

Two things made this expensive to diagnose:

- The form still looked saved. `handleSave` verifies its own round trip and
  throws, but the error is a raw PostgREST schema-cache message, which reads
  like a platform fault rather than "your change was not written".
- `duration_seconds=10` in the database is the column default, not a value
  anyone had chosen. So "OBS shows 10s and my setup says otherwise" looked
  like the overlay ignoring the setting, when in fact the setting was never
  stored.

The fix is two-sided. `tts_volume` is now probed once at load and omitted from
the write until the column exists, so the other twenty-two fields always save;
and the volume slider says which migration it is waiting for rather than
silently discarding the value.

Generalisable: **a migration file in supabase/migrations/ proves nothing about
the database.** Same class as tips.payment_transaction_id in
20261019000012, where a trigger read a column that did not exist and every
INSERT into tips failed. Read the live schema before believing the code.

## The overlay spoke the previous template after a save

The overlay re-reads its config on a 4s interval, which is fine for a stream
and loses a race with the obvious test: change the template, click TEST, and
the alert is spoken with the settings from up to four seconds ago. The creator
hears the old words and concludes the save did not work.

The queue now calls the refresh once before each alert speaks, so an alert
always uses the settings current at that moment. One RPC call on a single
indexed lookup, and the save-then-test loop stops lying.

## Verified, with the numbers

Realtime delivery is not the problem it appears to be. Subscribed exactly as
the overlay does, inserted a real tips row: push arrived in 756ms. The
perceived delay is synthesis: this provider takes 7-8s to render a line
(the bundled demo voice included), and the queue is held until speech ends.

There is no SQL-exec helper on this project -- probed every plausible name and
read the 34 exposed RPCs. DDL genuinely cannot be applied from the app, so the
paste-by-hand step is not an oversight.
