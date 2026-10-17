import { createAdminClient } from "@/lib/supabase/admin";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";
import { hasAudioSignature } from "@/lib/voice/audio-validation";

export const runtime = "nodejs";

const BUCKET = "donation-voice";
// Matches the bucket's file_size_limit in
// supabase/migrations/20261019000009_alerts_donation_voice_messages.sql. Kept in sync
// deliberately: the upload is rejected here before it can reach the bucket.
const MAX_BYTES = 1_500_000;
const MAX_SECONDS = 30;

/**
 * Only formats a browser MediaRecorder can actually emit. The extension is
 * derived from this map rather than from the filename, so a donor cannot
 * choose the stored extension.
 */
const ALLOWED: Record<string, { ext: string }> = {
  "audio/webm": { ext: "webm" },
  "audio/ogg": { ext: "ogg" },
  "audio/mp4": { ext: "m4a" },
  "audio/mpeg": { ext: "mp3" },
  "audio/mp3": { ext: "mp3" },
  "audio/wav": { ext: "wav" },
  "audio/x-wav": { ext: "wav" },
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Confirms the bytes really are the audio container the declared MIME type
 * claims.
 *
 * This matters because the bucket is public: an object whose declared type is
 * `audio/webm` but whose body is HTML would otherwise be served from a
 * Supabase domain as a document. The MIME allowlist above cannot catch that,
 * because the MIME type comes from the client.
 *
 * The check itself lives in lib/voice/audio-validation, shared with the voice
 * clone upload so the two cannot drift. The copy that used to sit here matched
 * WebM and Ogg against one OR'd branch, so an Ogg payload declared as
 * `audio/webm` passed validation and was then stored with a `.webm` extension.
 *
 * `ALLOWED` stays this route's own list: it is bounded by the `donation-voice`
 * bucket's `allowed_mime_types`, which the provider's wider list is not.
 */

/**
 * Accepts a donor voice message and stores it in the public
 * `donation-voice` bucket, returning the object path and a clamped duration.
 *
 * The returned `voicePath` is what the pay page hands to the payment API; it
 * is validated there again before being written to the donation, so this
 * route's output is never trusted on its own.
 */
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return json({ error: "Upload service is not configured." }, 503);
  }

  const supabase = createAdminClient();

  if (!(await allowPaymentRequest(supabase, request, "donation-voice", 4, 600))) {
    return json({ error: "Too many recordings. Try again later." }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid upload." }, 400);
  }

  const file = form.get("audio");
  if (!(file instanceof File)) {
    return json({ error: "No recording was sent." }, 400);
  }
  if (file.size === 0) {
    return json({ error: "That recording was empty." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "Keep voice messages under 1.5 MB." }, 413);
  }

  // A browser MediaRecorder labels its output "audio/webm;codecs=opus". Only
  // the essence type is meaningful for the allowlist, so drop the parameters
  // rather than making the client strip them.
  const mime = file.type.split(";")[0]!.trim().toLowerCase();
  const allowed = ALLOWED[mime];
  if (!allowed) {
    return json({ error: "Unsupported audio format." }, 415);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasAudioSignature(bytes, mime)) {
    return json({ error: "That file is not valid audio." }, 415);
  }

  // Duration is reported by the browser recorder and used only for display, so
  // it is clamped rather than trusted. The real ceiling is the byte limit
  // above: ~1.5 MB of Opus is roughly a minute of speech.
  const reported = Number(form.get("durationSeconds"));
  const durationSeconds = Number.isFinite(reported)
    ? Math.min(Math.max(Math.round(reported), 1), MAX_SECONDS)
    : MAX_SECONDS;

  const path = `${crypto.randomUUID()}.${allowed.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      // Never reuse a donor-supplied key; this path is generated above.
      upsert: false,
    });

  if (error) {
    return json({ error: "Could not store the recording." }, 503);
  }

  return json({ voicePath: path, durationSeconds });
}
