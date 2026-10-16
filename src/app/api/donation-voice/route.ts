import { createAdminClient } from "@/lib/supabase/admin";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";

export const runtime = "nodejs";

const BUCKET = "donation-voice";
// Matches the bucket's file_size_limit in
// supabase/migrations/20261019000009_donation_voice_messages.sql. Kept in sync
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
 * claims, by looking for the container's magic number.
 *
 * This matters because the bucket is public: an object whose declared type is
 * `audio/webm` but whose body is HTML would otherwise be served from a
 * Supabase domain as a document. The MIME allowlist alone cannot catch that,
 * because the MIME type comes from the client.
 */
function hasAudioSignature(bytes: Uint8Array, mime: string): boolean {
  const startsWith = (...sig: number[]) =>
    sig.every((byte, i) => bytes[i] === byte);
  const asciiAt = (offset: number, text: string) => {
    if (bytes.length < offset + text.length) return false;
    for (let i = 0; i < text.length; i += 1) {
      if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };

  // Matroska / WebM: 0x1A45DFA3. Ogg: "OggS".
  if (mime === "audio/webm" || mime === "audio/ogg") {
    return startsWith(0x1a, 0x45, 0xdf, 0xa3) || asciiAt(0, "OggS");
  }
  // ISO base media (m4a): a "ftyp" box at offset 4.
  if (mime === "audio/mp4") return asciiAt(4, "ftyp");
  // MP3: an "ID3" tag, or an MPEG audio frame sync (11 set bits).
  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return (
      asciiAt(0, "ID3") || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  // WAV: "RIFF"...."WAVE".
  if (mime === "audio/wav" || mime === "audio/x-wav") {
    return asciiAt(0, "RIFF") && asciiAt(8, "WAVE");
  }
  return false;
}

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
