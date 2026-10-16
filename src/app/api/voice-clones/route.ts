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

  // Optional, but it is what lets the engine clone a clip over 15s without an
  // ASR model. Capped well under the 300 the synthesis route allows: this is a
  // transcript of one short passage, and a long one is a sign the creator
  // pasted the wrong thing.
  const refText = String(form.get("ref_text") ?? "").trim().slice(0, 600);

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