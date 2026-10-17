import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createVoiceStudioVoice,
  deleteVoiceStudioVoice,
  voiceStudioConfigured,
  VoiceStudioError,
  hasAudioSignature,
  isAllowedMime,
  maxUploadBytes,
  maxUploadMegabytes,
  minUploadBytes,
} from "@/lib/voice/voicestudio";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Accepts a voice sample, hands it to VoiceStudio for cloning, and records the
 * resulting voice id against the creator.
 *
 * Ownership is taken from the session, never from the request body, and the
 * insert goes through the user client so RLS decides. The provider call happens
 * first: a failed clone must not leave a row the UI would render as a working
 * voice. The reverse — a row whose insert fails after a successful clone —
 * leaves an orphaned voice in the VoiceStudio instance, which the dashboard
 * shows as "no voices" until they delete it there.
 */
export async function POST(request: Request) {
  if (!voiceStudioConfigured()) {
    return json({ error: "Voice cloning is not configured." }, 503);
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid upload." }, 400);
  }

  const label = String(form.get("label") ?? "").trim();
  if (!label) return json({ error: "Give the voice a name." }, 400);
  if (label.length > 80) return json({ error: "That name is too long." }, 400);

  // The consent box is load-bearing: it is what makes consent_at non-null, and
  // a null consent_at hides the clone from the overlay entirely.
  if (form.get("consent") !== "true") {
    return json({ error: "You must confirm you have the right to clone this voice." }, 400);
  }

  const sample = form.get("sample");
  if (!(sample instanceof File)) {
    return json({ error: "No sample was sent." }, 400);
  }

  // Required, not optional.
  //
  // VoiceStudio transcribes the reference clip itself when no transcript is
  // supplied, and that changes what a clone IS rather than how it sounds. It
  // runs speech-to-text on the GPU on every synthesis, next to an OmniVoice
  // model that is already resident — on this instance that path fails outright
  // with `torch.AcceleratorError: CUDA error: unknown error`, and the sample
  // length cap drops from 20s to 15s.
  //
  // Measured on the same box, same clip, same line:
  //   with a transcript    2.9s / 3.4s / 3.6s
  //   without one          3.7s / 4.8s / 6.0s
  // which is the difference between a warm clone finishing inside the alert's
  // synthesis budget and tripping it. A clone that is slow enough to time out
  // costs the alert its voice, so the transcript is load-bearing.
  //
  // Capped well under the 300 the synthesis route allows: this is a transcript
  // of one short passage, and a long one is a sign the creator pasted the
  // wrong thing.
  const refText = String(form.get("ref_text") ?? "").trim().slice(0, 600);
  if (!refText) {
    return json(
      { error: "Add the words said in the sample. Without them the engine has to transcribe it on every alert." },
      400,
    );
  }

  const mime = sample.type.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedMime(mime)) {
    return json({ error: "Unsupported audio format." }, 415);
  }
  if (sample.size < minUploadBytes()) {
    return json({ error: "That sample is too short. Record at least a few seconds." }, 413);
  }
  if (sample.size > maxUploadBytes()) {
    return json({ error: `Keep samples under ${maxUploadMegabytes()} MB.` }, 413);
  }

  const bytes = new Uint8Array(await sample.arrayBuffer());
  if (!hasAudioSignature(bytes, mime)) {
    return json({ error: "That file is not valid audio." }, 415);
  }

  let voiceId: string;
  try {
    voiceId = await createVoiceStudioVoice(label, sample, refText);
  } catch (error) {
    // A 401/403 is the instance refusing the request itself — a missing or
    // mismatched API key, or a tunnel host name it does not recognise. It is
    // not about the recording, so it must not be reported as one: that sends
    // the creator off re-recording a perfectly good sample.
    if (error instanceof VoiceStudioError && error.refused) {
      console.error("[voice-clones] VoiceStudio refused the request:", error);
      return json(
        { error: "Voice cloning is not authorised against this VoiceStudio instance." },
        503,
      );
    }
    console.error("[voice-clones] provider rejected the sample:", error);
    return json({ error: "VoiceStudio could not clone that sample. Try a cleaner, longer clip." }, 502);
  }

  const { data: row, error: insertError } = await supabase
    .from("voice_clones")
    .insert({
      owner_id: auth.user.id,
      label,
      voicestudio_voice_id: voiceId,
      // Stored as well as sent. The provider holds its own copy on the profile,
      // but without this column every clone in the database reads as if it had
      // been built without a transcript — which is exactly how the clone that
      // was actually re-transcribing on the GPU on every alert stayed invisible.
      reference_transcript: refText,
      consent_at: new Date().toISOString(),
    })
    .select("id, label, voicestudio_voice_id, consent_at, created_at")
    .single();

  if (insertError || !row) {
    // The voice exists upstream but we cannot reference it. Surface the orphan
    // rather than swallowing it — the log line has the id for manual cleanup.
    console.error(
      `[voice-clones] clone ${voiceId} was created upstream but the row failed to insert:`,
      insertError,
    );
    try {
      await deleteVoiceStudioVoice(voiceId);
    } catch {
      // Best effort. The orphaned id is in the log line above.
    }
    return json({ error: "Could not save that voice. Try again." }, 503);
  }

  return json({ clone: row }, 201);
}