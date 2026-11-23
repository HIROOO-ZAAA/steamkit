// src/app/api/tts/synthesize/route.ts
//
// Synthesises a donor's alert line in the creator's cloned VoiceStudio voice.
//
// NOT src/app/api/donation-voice/route.ts. That route is the donor voice
// message *upload* (pay/[username] posts to it; api/payments/khqr validates
// its voicePath). This is a different feature.
//
// ASSUMPTIONS -- verified against the schema, see PROJECT_MEMORY.md:
//   1. streamkit_resolve_overlay(text) is a RETURNS TABLE function, so
//      supabase-js hands back an ARRAY. Resolving `.creator_id` straight off
//      `data` yields undefined and this route 401s on every valid token.
//   2. voice_clones has: id, owner_id, voicestudio_voice_id, consent_at.
//      (renamed from elevenlabs_voice_id by migration
//      20261017000004_voice_voicestudio_backend.sql)
//   3. The tts-cache bucket is private — NOT public like donation-voice, or
//      creator voice clones would be served from a public Supabase domain.
//   4. The client is the service-role one (lib/supabase/admin). This route is
//      reached from an OBS browser source holding only the anon key.
//   5. VOICESTUDIO_BASE_URL points at your reverse proxy, e.g.
//      https://tts.yourdomain.com — NOT localhost:3900, which only exists on
//      whichever machine runs the sidecar. VOICESTUDIO_SHARED_SECRET must equal
//      that instance's OMNIVOICE_API_KEY: a tunnel host name is not one
//      VoiceStudio recognises, so without the key every request is refused.
//      Both are read in lib/voice/voicestudio.ts so the clone and synthesis
//      paths cannot disagree about the credential.
//   6. VoiceStudio's OpenAI-compatible endpoint is POST /v1/audio/speech with a
//      JSON body { model, input, voice, response_format } and raw audio bytes
//      back (mp3 by default). There is no /v1/tts. `voice` takes a voice
//      profile id, or "default" for the engine default.

import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";
import {
  synthesizeVoiceStudioSpeech,
  voiceStudioConfigured,
  VoiceStudioError,
  looksLikeAudio,
  sanitizeAlertText,
} from "@/lib/voice/voicestudio";
import crypto from "node:crypto";
import {
  ALERT_TTS_GENERATION_TIMEOUT_MS,
  remainingTtsGenerationBudget,
  ttsGenerationFailureStatus,
} from "@/lib/voice/tts-timeouts";
import { selectedCloneId } from "@/lib/voice/clone-selection";
import { recordTtsObservation } from "@/lib/voice/tts-health";
import { shouldUseDefaultVoiceFallback } from "@/lib/voice/tts-fallback";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_VOICE_ID = process.env.VOICESTUDIO_DEFAULT_VOICE_ID ?? "default";
/**
 * The provider's observed cold start is around 40 seconds. Leave 55 seconds
 * for synthesis and five seconds for request validation, storage, and signing.
 * The route maxDuration advertises the complete 60-second runtime budget.
 */
const GENERATE_TIMEOUT_MS = ALERT_TTS_GENERATION_TIMEOUT_MS;

const CACHE_BUCKET = "tts-cache";

function cacheKeyFor(voiceId: string, text: string): string {
  return crypto.createHash("sha256").update(`${voiceId}:${text}`).digest("hex");
}

/**
 * Runs `fn` with a deadline, aborting the underlying fetch when it expires.
 *
 * A bare Promise.race would only stop us waiting; the provider fetch must also
 * receive the abort signal.
 */
async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, ms);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Raised by `withTimeout`, so "we gave up" is distinguishable from "it failed". */
class TimeoutError extends Error {
  constructor() {
    super("tts_timeout");
    this.name = "TimeoutError";
  }
}

/**
 * One synthesis attempt, bounded by `budgetMs`.
 *
 * The remaining deadline budget is passed through without extension.
 * The budget covers the queue wait as well as the synthesis: requests serialise
 * inside `synthesizeVoiceStudioSpeech` because the provider has a single GPU
 * worker. The deadline is ours, not the provider's, and is never extended when
 * nearly exhausted.
 */
async function attemptSynthesis(
  voiceId: string,
  text: string,
  budgetMs: number,
): Promise<ArrayBuffer> {
  if (budgetMs <= 0) throw new TimeoutError();
  return withTimeout(
    (signal) => synthesizeVoiceStudioSpeech(voiceId, text, signal),
    budgetMs,
  );
}

export async function POST(req: Request) {
  if (!voiceStudioConfigured()) {
    return NextResponse.json({ error: "tts backend not configured" }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { error: "synthesis service is not configured" },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();

  // An OBS browser source will happily loop this route if a scene reloads in a
  // tight cycle, and every miss is a billable synthesis call.
  if (!(await allowPaymentRequest(supabase, req, "tts-synthesize", 30, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const overlayToken = body?.overlayToken;
  const rawText = body?.text;
  const rawDonationId = body?.donationId;
  const requireClone = body?.requireClone === true;
  const donationId = typeof rawDonationId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawDonationId)
    ? rawDonationId
    : "unattributed";

  // `donationId` is accepted for call-site correlation but intentionally not
  // required: it is never read, and making it mandatory would reject a valid
  // overlay request over a field nothing depends on.
  if (typeof overlayToken !== "string" || !overlayToken) {
    return NextResponse.json({ error: "overlayToken is required" }, { status: 400 });
  }
  if (typeof rawText !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const text = sanitizeAlertText(rawText);
  console.error(
    `[tts] payment_id=${donationId} stage=request_received text_chars=${text.length}`,
  );
  if (!text) {
    console.error(`[tts] payment_id=${donationId} stage=request_rejected reason=empty_text`);
    return NextResponse.json({ error: "empty text after sanitization" }, { status: 400 });
  }

  // Resolve the token to a creator — same RPC the rest of the overlay surface
  // uses, so this route cannot drift from how overlays are authenticated.
  const { data: resolved, error: resolveError } = await supabase.rpc(
    "streamkit_resolve_overlay",
    { p_token: overlayToken },
  );

  // RETURNS TABLE -> supabase-js returns an array, and an empty array means the
  // token matched nothing. Both must land on the same 401 so a caller cannot
  // tell a bad token from a missing one.
  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;
  // A resolve ERROR is a service problem (most often the missing
  // `grant execute ... to service_role` on streamkit_resolve_overlay), which is
  // a 503. Only a clean resolve that matched no row is a bad token, which is a
  // 401. Collapsing both into 401 previously reported a privilege problem as a
  // creator error.
  if (resolveError) {
    console.error(
      `[tts] payment_id=${donationId} stage=overlay_resolution result=failed ` +
        `code=${resolveError.code ?? "unknown"} ` +
        `message=${String(resolveError.message ?? "").slice(0, 160)}`,
    );
    return NextResponse.json({ error: "speech service unavailable" }, { status: 503 });
  }
  if (!overlay?.creator_id) {
    console.error(
      `[tts] payment_id=${donationId} stage=overlay_resolution result=failed error=invalid_token`,
    );
    return NextResponse.json({ error: "invalid overlay token" }, { status: 401 });
  }

  const creatorId: string = overlay.creator_id;

  // Resolve the voice. A cloned voice must belong to THIS creator and have
  // recorded consent — there is no session here, so the token's resolved
  // creator is the only anchor a caller cannot forge.
  //
  // The overlay names no voice: the creator's own voice settings decide.
  //
  // The saved selection is authoritative. Never substitute another clone
  // when the selected one is missing or unusable.
  let voiceId = DEFAULT_VOICE_ID;

  const { data: voicePrefs, error: voicePrefsError } = await supabase
    .from("voice_settings")
    .select("cloning_enabled, active_clone_id")
    .eq("user_id", creatorId)
    .maybeSingle();

  console.error(
    `[tts] payment_id=${donationId} stage=voice_settings enabled=${voicePrefs?.cloning_enabled === true} ` +
      `clone_selected=${Boolean(selectedCloneId(voicePrefs))} ` +
      `settings_error=${voicePrefsError?.code ?? "none"}`,
  );

  if (voicePrefsError) {
    return NextResponse.json({ error: "could not load saved voice settings" }, { status: 503 });
  }

  const configuredCloneId = selectedCloneId(voicePrefs);
  if (configuredCloneId) {
    const { data: chosen, error: chosenError } = await supabase
      .from("voice_clones")
      .select("voicestudio_voice_id")
      .eq("id", configuredCloneId)
      .eq("owner_id", creatorId)
      .not("consent_at", "is", null)
      .not("voicestudio_voice_id", "is", null)
      .maybeSingle();

    if (chosen?.voicestudio_voice_id) {
      voiceId = chosen.voicestudio_voice_id;
    }
    console.error(
      `[tts] payment_id=${donationId} stage=selected_clone_resolution ` +
        `result=${chosen?.voicestudio_voice_id ? "resolved" : "unresolved"} ` +
        `error=${chosenError?.code ?? "none"}`,
    );
    if (chosenError) {
      return NextResponse.json({ error: "could not resolve selected voice clone" }, { status: 503 });
    }
    if (!chosen?.voicestudio_voice_id) {
      return NextResponse.json({ error: "selected voice clone is not ready" }, { status: 409 });
    }
  }

  if (requireClone && !configuredCloneId) {
    console.error(`[tts] payment_id=${donationId} stage=selected_clone_resolution result=missing`);
    return NextResponse.json({ error: "no selected voice clone is enabled" }, { status: 409 });
  }

  let voiceSource: "clone" | "fallback" = configuredCloneId ? "clone" : "fallback";

  /**
   * createSignedUrl doubles as an existence probe: it fails for a missing object,
   * which is exactly the "not cached" answer we want.
   *
   * NOTE: the resulting URL is minted here, on whichever instance served the
   * request. Supabase signed URLs are HMACs, not redirects, so the caller must
   * be able to reach the same instance. Relevant only when the app runs on
   * Vercel while the database is a self-hosted or direct-connection Supabase
   * project; currently `.env.local` points at the cloud project, so it holds.
   */
  const lookup = async (id: string) => {
    const { data } = await supabase.storage
      .from(CACHE_BUCKET)
      .createSignedUrl(`${cacheKeyFor(id, text)}.mp3`, 60 * 10);
    return data?.signedUrl ?? null;
  };

  const cached = await lookup(voiceId);
  if (cached) {
    recordTtsObservation(creatorId, { stage: "audio_ready", result: "audio", voiceSource });
    console.error(
      `[tts] payment_id=${donationId} stage=audio_cache result=hit ` +
        `voice=${voiceSource === "clone" ? "clone" : "default"}`,
    );
    return NextResponse.json({
      audioUrl: cached,
      cached: true,
      voiceId,
      usedClone: voiceSource === "clone",
      fellBack: false,
    });
  }

  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  const remaining = () => remainingTtsGenerationBudget(deadline);
  let audioBuffer: ArrayBuffer;
  let fellBack = false;

  const isClone = voiceSource === "clone";
  console.error(
    `[tts] payment_id=${donationId} stage=provider_request result=started ` +
      `voice=${isClone ? "clone" : "default"} text_chars=${text.length}`,
  );
  recordTtsObservation(creatorId, { stage: "started", result: "started", voiceSource });

  try {
    audioBuffer = await attemptSynthesis(voiceId, text, remaining());
    recordTtsObservation(creatorId, { stage: "provider_audio", result: "audio", voiceSource });
    console.error(
      `[tts] payment_id=${donationId} stage=provider_result result=audio ` +
        `bytes=${audioBuffer.byteLength} elapsed_ms=${GENERATE_TIMEOUT_MS - remaining()}`,
    );
  } catch (error) {
    const providerStatus = error instanceof VoiceStudioError ? error.status : "none";
    const timedOut = error instanceof TimeoutError;
    const answeredProviderError = error instanceof VoiceStudioError;
    const failureKind = timedOut ? "timeout" : answeredProviderError ? "provider" : "transport";
    console.error(
      `[tts] payment_id=${donationId} stage=provider_result result=failed ` +
        `error=${error instanceof Error ? error.name : "unknown"} ` +
        `status=${providerStatus} elapsed_ms=${GENERATE_TIMEOUT_MS - remaining()}`,
    );
    if (error instanceof VoiceStudioError && error.refused) {
      console.error("[tts] VoiceStudio refused the synthesis request (auth/host configuration)");
    }
    console.error(
      `[tts] synthesis failed error=${error instanceof Error ? error.name : "unknown"} ` +
        `status=${error instanceof VoiceStudioError ? error.status : "none"}`,
    );

    if (error instanceof TimeoutError) {
      recordTtsObservation(creatorId, {
        stage: "failed",
        result: "failed",
        ...(typeof providerStatus === "number" ? { providerStatus } : {}),
        voiceSource,
        failureKind: "timeout",
      });
      console.error("[tts] generation deadline reached; no voice fallback was attempted");
      return NextResponse.json(
        { error: "tts generation timed out" },
        { status: ttsGenerationFailureStatus(true) },
      );
    }

    const shouldFallback = shouldUseDefaultVoiceFallback({
      voiceSource,
      failureKind,
      providerRefused: error instanceof VoiceStudioError && error.refused,
    });
    if (!shouldFallback) {
      recordTtsObservation(creatorId, {
        stage: "failed",
        result: "failed",
        ...(typeof providerStatus === "number" ? { providerStatus } : {}),
        voiceSource,
        failureKind,
      });
      return NextResponse.json(
        { error: "tts generation failed" },
        { status: ttsGenerationFailureStatus(false) },
      );
    }

    console.error(
      `[tts] payment_id=${donationId} stage=fallback_request result=started reason=provider_error`,
    );
    voiceId = DEFAULT_VOICE_ID;
    voiceSource = "fallback";
    fellBack = true;

    const cachedFallback = await lookup(voiceId);
    if (cachedFallback) {
      recordTtsObservation(creatorId, { stage: "audio_ready", result: "audio", voiceSource });
      console.error(`[tts] payment_id=${donationId} stage=fallback_cache result=hit`);
      return NextResponse.json({
        audioUrl: cachedFallback,
        cached: true,
        voiceId,
        usedClone: false,
        fellBack,
      });
    }

    recordTtsObservation(creatorId, { stage: "started", result: "started", voiceSource });
    try {
      audioBuffer = await attemptSynthesis(voiceId, text, remaining());
      recordTtsObservation(creatorId, { stage: "provider_audio", result: "audio", voiceSource });
      console.error(
        `[tts] payment_id=${donationId} stage=fallback_result result=audio ` +
          `bytes=${audioBuffer.byteLength} elapsed_ms=${GENERATE_TIMEOUT_MS - remaining()}`,
      );
    } catch (fallbackError) {
      const fallbackTimedOut = fallbackError instanceof TimeoutError;
      const fallbackAnswered = fallbackError instanceof VoiceStudioError;
      const fallbackStatus = fallbackError instanceof VoiceStudioError ? fallbackError.status : "none";
      recordTtsObservation(creatorId, {
        stage: "failed",
        result: "failed",
        ...(typeof fallbackStatus === "number" ? { providerStatus: fallbackStatus } : {}),
        voiceSource,
        failureKind: fallbackTimedOut ? "timeout" : fallbackAnswered ? "provider" : "transport",
      });
      console.error(
        `[tts] payment_id=${donationId} stage=fallback_result result=failed ` +
          `error=${fallbackError instanceof Error ? fallbackError.name : "unknown"} ` +
          `status=${fallbackStatus} elapsed_ms=${GENERATE_TIMEOUT_MS - remaining()}`,
      );
      return NextResponse.json(
        { error: "tts fallback failed" },
        { status: ttsGenerationFailureStatus(fallbackTimedOut) },
      );
    }
  }

  if (!looksLikeAudio(audioBuffer)) {
    recordTtsObservation(creatorId, { stage: "failed", result: "failed", voiceSource, failureKind: "invalid_audio" });
    return NextResponse.json(
      { error: "tts provider returned unexpected payload" },
      { status: 502 },
    );
  }

  // Keyed on the voice that actually produced the bytes above.
  const cachePath = `${cacheKeyFor(voiceId, text)}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(CACHE_BUCKET)
    .upload(cachePath, Buffer.from(audioBuffer), {
      contentType: "audio/mpeg",
      cacheControl: "604800", // 7 days
      upsert: true,
    });

  if (uploadError) {
    recordTtsObservation(creatorId, { stage: "failed", result: "failed", voiceSource, failureKind: "storage" });
    return NextResponse.json({ error: "failed to cache audio" }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from(CACHE_BUCKET)
    .createSignedUrl(cachePath, 60 * 10);

  if (!signed?.signedUrl) {
    recordTtsObservation(creatorId, { stage: "failed", result: "failed", voiceSource, failureKind: "storage" });
    return NextResponse.json({ error: "failed to sign audio" }, { status: 500 });
  }

  recordTtsObservation(creatorId, { stage: "audio_ready", result: "audio", voiceSource });
  return NextResponse.json({
    audioUrl: signed.signedUrl,
    cached: false,
    voiceId,
    usedClone: voiceSource === "clone",
    fellBack,
  });
}
