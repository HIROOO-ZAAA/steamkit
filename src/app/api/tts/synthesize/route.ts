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

export const runtime = "nodejs";

const DEFAULT_VOICE_ID = process.env.VOICESTUDIO_DEFAULT_VOICE_ID ?? "default";
/**
 * An alert is on screen for ~7s. Synthesis slower than this is worse than no
 * synthesis, so we bail to the stock voice rather than stall the queue.
 * Self-hosted inference can be slower than a managed API.
 *
 * This is the budget for the WHOLE request, not per attempt: the caller's client
 * aborts at SYNTHESIS_TIMEOUT_MS (12s in the overlay), so two attempts sharing
 * it is the whole design. FALLBACK_RESERVE_MS below is what makes the split
 * survivable.
 */
const GENERATE_TIMEOUT_MS = 10_000;

/**
 * Floor on a single attempt.
 *
 * A negative budget is the bug this replaced: Node's `setTimeout` treats one
 * as "fire immediately", so the request was aborted before it was ever sent
 * and the caller was told the provider had failed. Measured on a real browser
 * alert: `TimeoutNegativeWarning: -263 is a negative number`, then
 * `[tts] fallback synthesis also failed: tts_timeout` — the stock-voice retry
 * was aborted before it left the process, so a slow clone cost the alert every
 * voice instead of only the cloned one.
 *
 * There is deliberately NO per-attempt reserve any more. The clone gets the
 * whole remaining budget because the fallback it used to be protecting is now
 * only reached after a FAST provider failure, which leaves time by itself. The
 * measurements justify spending it: a clone WITH a reference transcript takes
 * 2.9-3.6s, one WITHOUT takes 3.7-6.0s because the engine transcribes the
 * reference clip on the GPU during every synthesis. Six seconds was the
 * difference between finishing and timing out.
 */
const MIN_ATTEMPT_MS = 1_500;

const CACHE_BUCKET = "tts-cache";

function cacheKeyFor(voiceId: string, text: string): string {
  return crypto.createHash("sha256").update(`${voiceId}:${text}`).digest("hex");
}

/**
 * Runs `fn` with a deadline, aborting the underlying fetch when it expires.
 *
 * A bare Promise.race would only stop us *waiting*: the VoiceStudio request
 * would keep running on the GPU after we had already moved on to the fallback.
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
 * The budget is floored at MIN_ATTEMPT_MS rather than passed through. A
 * negative value is the bug this replaced: `setTimeout` treats it as "fire
 * immediately", so the request was aborted before it was ever sent and the
 * caller was told the provider failed.
 *
 * The budget covers the queue wait as well as the synthesis: requests serialise
 * inside `synthesizeVoiceStudioSpeech` because the provider has a single GPU
 * worker. The deadline is ours, not the provider's.
 */
async function attemptSynthesis(
  voiceId: string,
  text: string,
  budgetMs: number,
): Promise<ArrayBuffer> {
  return withTimeout(
    (signal) => synthesizeVoiceStudioSpeech(voiceId, text, signal),
    Math.max(budgetMs, MIN_ATTEMPT_MS),
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
  const voiceCloneId = body?.voiceCloneId;

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
  if (!text) {
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
  if (resolveError || !overlay?.creator_id) {
    return NextResponse.json({ error: "invalid overlay token" }, { status: 401 });
  }

  const creatorId: string = overlay.creator_id;

  // Resolve the voice. A cloned voice must belong to THIS creator and have
  // recorded consent — there is no session here, so the token's resolved
  // creator is the only anchor a caller cannot forge.
  //
  // The overlay names no voice: the creator's own voice settings decide.
  //
  // A clone they picked in voice settings is exactly what they asked for, so it
  // wins - but only once cloning is switched on, so that leaving the toggle on
  // with nothing selected cannot silently change an alert's voice. It is still
  // checked for ownership and recorded consent, exactly like the automatic
  // choice below.
  //
  // With cloning off this falls back to the newest clone that has both a
  // provider id and recorded consent. Both conditions are required — consent_at
  // says the sample was cleared, the id says the provider handed one back, and
  // a row missing either is silently unusable rather than an error the creator
  // can act on. An explicit voiceCloneId still wins, and is still
  // ownership-checked below.
  let voiceId = DEFAULT_VOICE_ID;

  const { data: voicePrefs } = await supabase
    .from("voice_settings")
    .select("cloning_enabled, active_clone_id")
    .eq("user_id", creatorId)
    .maybeSingle();

  if (voicePrefs?.cloning_enabled && voicePrefs.active_clone_id) {
    const { data: chosen } = await supabase
      .from("voice_clones")
      .select("voicestudio_voice_id")
      .eq("id", voicePrefs.active_clone_id)
      .eq("owner_id", creatorId)
      .not("consent_at", "is", null)
      .not("voicestudio_voice_id", "is", null)
      .maybeSingle();

    if (chosen?.voicestudio_voice_id) {
      voiceId = chosen.voicestudio_voice_id;
    }
  }

  if (voiceId === DEFAULT_VOICE_ID) {
    const { data: autoVoice } = await supabase
      .from("voice_clones")
      .select("voicestudio_voice_id")
      .eq("owner_id", creatorId)
      .not("consent_at", "is", null)
      .not("voicestudio_voice_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (autoVoice?.voicestudio_voice_id) {
      voiceId = autoVoice.voicestudio_voice_id;
    }
  }

  if (voiceCloneId) {
    const { data: clone, error: cloneError } = await supabase
      .from("voice_clones")
      .select("id, voicestudio_voice_id, consent_at")
      .eq("id", voiceCloneId)
      .eq("owner_id", creatorId)
      .maybeSingle();

    if (cloneError) {
      return NextResponse.json({ error: "could not read that voice" }, { status: 500 });
    }
    if (!clone) {
      return NextResponse.json({ error: "voice clone not found" }, { status: 404 });
    }
    if (!clone.consent_at) {
      return NextResponse.json(
        { error: "voice clone has no recorded consent" },
        { status: 403 },
      );
    }
    // consent_at says the sample was cleared; it does not guarantee the
    // provider handed back an id. Fall back instead of synthesising with null.
    if (!clone.voicestudio_voice_id) {
      return NextResponse.json(
        { error: "voice clone has no provider voice id" },
        { status: 409 },
      );
    }
    voiceId = clone.voicestudio_voice_id;
  }

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
    return NextResponse.json({ audioUrl: cached, cached: true, voiceId, fellBack: false });
  }

  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  const remaining = () => deadline - Date.now();
  let audioBuffer: ArrayBuffer;
  let fellBack = false;

  const isClone = voiceId !== DEFAULT_VOICE_ID;

  try {
    audioBuffer = await attemptSynthesis(voiceId, text, remaining());
  } catch (error) {
    // The overlay falls back to the OS voice on any failure, so a refused
    // request would otherwise be invisible: every alert quietly stops being the
    // creator's cloned voice with nothing in the logs but a bare status.
    if (error instanceof VoiceStudioError && error.refused) {
      console.error(
        "[tts] VoiceStudio refused the request — the API key or base URL is wrong:",
        error,
      );
    }
    console.error(`[tts] synthesis failed for voice ${voiceId}:`, error);

    // Only fall back when a clone was what failed. Retrying the stock voice
    // after the stock voice already failed just doubles the latency.
    if (!isClone) {
      return NextResponse.json({ error: "tts generation failed" }, { status: 502 });
    }

    // A timeout means we stopped listening but VoiceStudio did not stop
    // working: that request still holds the single GPU worker. Retrying now
    // would be rejected with `worker pool is saturated`, and the retry's own
    // abandonment would queue yet another job behind it — so one slow alert
    // would permanently wedge the voice for every later one. Give the worker
    // back instead, and let the overlay use the OS voice for this alert only.
    if (error instanceof TimeoutError) {
      console.error(
        "[tts] gave up on a slow request; not retrying, the provider is still " +
          "synthesising it and holds the only GPU worker",
      );
      return NextResponse.json({ error: "tts generation timed out" }, { status: 504 });
    }

    // Everything else is the provider ANSWERING — a 500 from the reference
    // transcription, a 429, a bad payload. Nothing is left running on the GPU,
    // so the stock voice is worth a try and has the rest of the budget.
    //
    // From here on the STOCK voice is what speaks. Reassigning `voiceId` is
    // load-bearing, not cosmetic: it decides both the cache key the audio is
    // written under and the id reported back. Leaving it pointing at the clone
    // stored the stock voice's audio under the clone's key, so the very next
    // alert with the same words was served that stock audio from the cache and
    // the clone was never tried again.
    voiceId = DEFAULT_VOICE_ID;
    fellBack = true;

    // The stock voice may already have this line from a previous fallback.
    const cachedFallback = await lookup(voiceId);
    if (cachedFallback) {
      return NextResponse.json({
        audioUrl: cachedFallback,
        cached: true,
        voiceId,
        fellBack,
      });
    }

    try {
      audioBuffer = await attemptSynthesis(voiceId, text, remaining());
    } catch (fallbackError) {
      console.error("[tts] fallback synthesis also failed:", fallbackError);
      return NextResponse.json({ error: "tts generation failed" }, { status: 502 });
    }
  }

  if (!looksLikeAudio(audioBuffer)) {
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
    return NextResponse.json({ error: "failed to cache audio" }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from(CACHE_BUCKET)
    .createSignedUrl(cachePath, 60 * 10);

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "failed to sign audio" }, { status: 500 });
  }

  return NextResponse.json({ audioUrl: signed.signedUrl, cached: false, voiceId, fellBack });
}