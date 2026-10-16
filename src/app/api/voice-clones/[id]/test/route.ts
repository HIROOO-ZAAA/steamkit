// src/app/api/voice-clones/[id]/test/route.ts
//
// Dashboard-only voice preview.
//
// Deliberately NOT /api/tts/synthesize: that route is reached by an OBS
// browser source holding nothing but an overlay token, while this one is only
// ever called by a signed-in creator. Session auth here, so the ownership check
// is a real one (`.eq("owner_id", auth.user.id)` under RLS) instead of the
// token-resolution anchor the overlay route has to use.
//
// The provider call goes through lib/voice/voicestudio rather than a second
// hand-rolled fetch: that duplication is what shipped the three defects this
// replaces — a `/v1/tts` endpoint that does not exist, an `X-Internal-Key`
// header the backend ignores, and a config check on a variable nothing reads.

import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

/**
 * Far longer than the alert route's 10s, because a test click is a deliberate
 * wait rather than a 7-second overlay: a cold model load measured ~40s and the
 * request crosses a Cloudflare tunnel that caps at 100s. Warm is ~1.5s.
 */
const GENERATE_TIMEOUT_MS = 90_000;

const CACHE_BUCKET = "tts-cache";
/** Only has to outlive the click that opened it. */
const SIGNED_URL_TTL_S = 120;
const TEST_PATH_PREFIX = "test";

const DEFAULT_TEST_PHRASE =
  "This is a test of your alert voice. Thanks so much for the support!";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!voiceStudioConfigured()) {
    return NextResponse.json({ error: "tts backend not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // A missing row and someone else's row are deliberately the same answer:
  // distinguishing them tells a caller whether a given uuid exists.
  const { data: clone, error: cloneError } = await supabase
    .from("voice_clones")
    .select("id, voicestudio_voice_id, consent_at")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (cloneError) {
    return NextResponse.json({ error: "could not read that voice" }, { status: 500 });
  }
  if (!clone) {
    return NextResponse.json({ error: "voice clone not found" }, { status: 404 });
  }
  // The same gate the alert route enforces, so a preview cannot be had for a
  // voice the overlay would refuse to speak.
  if (!clone.consent_at) {
    return NextResponse.json(
      { error: "voice clone has no recorded consent" },
      { status: 403 },
    );
  }
  // consent_at says the sample was cleared; it does not guarantee the provider
  // handed back an id.
  if (!clone.voicestudio_voice_id) {
    return NextResponse.json(
      { error: "voice clone has no provider voice id" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  // Every click is uncached GPU work, and the button is reachable by anyone
  // signed in. Without this a held-down button queues one synthesis per press.
  if (!(await allowPaymentRequest(admin, request, "tts-voice-test", 10, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const requested = typeof body?.text === "string" ? body.text : "";
  const text = sanitizeAlertText(requested) || DEFAULT_TEST_PHRASE;

  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await synthesizeVoiceStudioSpeech(
      clone.voicestudio_voice_id,
      text,
      // Aborts the upstream fetch, so giving up here does not leave the job
      // running on the GPU.
      AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    );
  } catch (error) {
    // A 401/403 is the instance refusing the request — a missing or mismatched
    // API key, or a tunnel host name it does not recognise. Retrying will not
    // help and the creator cannot fix it from this page.
    if (error instanceof VoiceStudioError && error.refused) {
      console.error("[voice-test] VoiceStudio refused the request:", error);
      return NextResponse.json(
        { error: "VoiceStudio refused the request. Check the backend API key." },
        { status: 503 },
      );
    }
    // Worth surfacing verbatim: a reference over the engine's length limit is
    // reported as a generic generation failure otherwise, which sends the
    // creator off re-recording a sample the engine simply cannot align.
    console.error("[voice-test] generation failed:", error);
    const detail = error instanceof VoiceStudioError ? ` ${error.message}` : "";
    return NextResponse.json(
      { error: `Could not generate a preview.${detail}` },
      { status: 502 },
    );
  }

  if (!looksLikeAudio(audioBuffer)) {
    return NextResponse.json(
      { error: "tts backend returned unexpected payload" },
      { status: 502 },
    );
  }

  // Deliberately NOT the shared (voiceId, text) key real alerts use: a test
  // phrase could collide with that cache or pollute it. Own throwaway path, and
  // the storage admin because `tts-cache` is private with no storage.objects
  // policies — the session client cannot write there.
  const testPath = `${TEST_PATH_PREFIX}/${auth.user.id}/${crypto.randomUUID()}.mp3`;

  const { error: uploadError } = await admin.storage
    .from(CACHE_BUCKET)
    .upload(testPath, Buffer.from(audioBuffer), {
      contentType: "audio/mpeg",
      cacheControl: "60", // short-lived preview, not alert audio
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: "failed to store preview audio" }, { status: 500 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(CACHE_BUCKET)
    .createSignedUrl(testPath, SIGNED_URL_TTL_S);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "failed to sign preview audio" }, { status: 500 });
  }

  return NextResponse.json(
    { audioUrl: signed.signedUrl, voiceId: clone.voicestudio_voice_id },
    { headers: { "Cache-Control": "no-store" } },
  );
}