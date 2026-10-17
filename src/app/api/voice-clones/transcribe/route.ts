import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";
import {
  hasAudioSignature,
  isAllowedMime,
  maxUploadBytes,
  maxUploadMegabytes,
  minUploadBytes,
  transcribeVoiceStudioAudio,
  voiceStudioConfigured,
  VoiceStudioError,
} from "@/lib/voice/voicestudio";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!voiceStudioConfigured()) {
    return json({ error: "Voice transcription is not configured." }, 503);
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient();
  if (!(await allowPaymentRequest(admin, request, "voice-clone-transcribe", 5, 60))) {
    return json({ error: "Too many transcription requests. Wait a minute and try again." }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid audio upload." }, 400);
  }

  const sample = form.get("sample");
  const languageValue = form.get("language");
  const language = languageValue === "km" || languageValue === "en" ? languageValue : undefined;
  if (languageValue && !language) return json({ error: "Choose Khmer, English, or automatic language detection." }, 400);
  if (!(sample instanceof File)) return json({ error: "Choose a voice sample first." }, 400);
  const mime = sample.type.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedMime(mime)) return json({ error: "Unsupported audio format." }, 415);
  if (sample.size < minUploadBytes()) return json({ error: "That recording is too short to transcribe." }, 413);
  if (sample.size > maxUploadBytes()) {
    return json({ error: `Keep samples under ${maxUploadMegabytes()} MB.` }, 413);
  }

  const bytes = new Uint8Array(await sample.arrayBuffer());
  if (!hasAudioSignature(bytes, mime)) return json({ error: "That file is not valid audio." }, 415);

  try {
    const text = await transcribeVoiceStudioAudio(sample, language);
    return json({ text });
  } catch (error) {
    if (error instanceof VoiceStudioError && error.refused) {
      return json({ error: "VoiceStudio refused transcription. Check the backend API key." }, 503);
    }
    if (error instanceof VoiceStudioError && error.status === 409) {
      return json({ error: "VoiceStudio has no speech-recognition model installed. You can enter the transcript manually." }, 503);
    }
    console.error("[voice-clones] sample transcription failed:", error);
    return json({ error: "Could not transcribe this sample. Enter the exact words manually and check spelling before creating the clone." }, 502);
  }
}
