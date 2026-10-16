import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ElevenLabs instant voice cloning.
 *
 * The sample is forwarded to the provider and never stored here: the resulting
 * `voice_id` is the only handle we keep. Nothing lands in a Supabase bucket, so
 * there is no second copy of someone's biometric audio to protect or delete.
 */

const API_BASE = "https://api.elevenlabs.io/v1";
const UPLOAD_TIMEOUT_MS = 30_000;

/** ElevenLabs accepts a handful of containers; a browser recording is WebM/Opus. */
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/flac",
]);

/** ElevenLabs rejects clips outside roughly 30s–5min; 20 MB is its hard cap. */
const MAX_BYTES = 20_000_000;
const MIN_BYTES = 5_000;

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/**
 * Confirms the bytes really are the audio container the declared MIME type
 * claims. The MIME type arrives from the client, so on its own it proves
 * nothing -- this is the same reasoning as the magic-byte check in
 * /api/donation-voice.
 */
export function hasAudioSignature(bytes: Uint8Array, mime: string): boolean {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const asciiAt = (offset: number, text: string) => {
    if (bytes.length < offset + text.length) return false;
    for (let i = 0; i < text.length; i += 1) {
      if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };

  // Matroska / WebM: 0x1A45DFA3. Ogg and FLAC: "OggS" / "fLaC".
  if (mime === "audio/webm") return startsWith(0x1a, 0x45, 0xdf, 0xa3);
  if (mime === "audio/ogg") return asciiAt(0, "OggS");
  if (mime === "audio/flac") return asciiAt(0, "fLaC");
  // ISO base media (m4a): a "ftyp" box at offset 4.
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return asciiAt(4, "ftyp");
  // MP3: an "ID3" tag, or an MPEG audio frame sync (11 set bits).
  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return (
      asciiAt(0, "ID3") ||
      (bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  // WAV: "RIFF"...."WAVE".
  if (mime === "audio/wav" || mime === "audio/x-wav") {
    return asciiAt(0, "RIFF") && asciiAt(8, "WAVE");
  }
  return false;
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function maxUploadBytes(): number {
  return MAX_BYTES;
}

export function minUploadBytes(): number {
  return MIN_BYTES;
}

export async function createElevenLabsVoice(
  name: string,
  sample: File,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY!.trim();

  const form = new FormData();
  form.append("name", name);
  form.append("description", "StreamKit donation alert voice");
  // `files` is ElevenLabs' field name; a Blob keeps the filename out of our
  // control, which is what we want -- the label is never used as a path.
  form.append("files", new Blob([await sample.arrayBuffer()], { type: sample.type }));

  const res = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs_create_${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { voice_id?: unknown };
  if (typeof payload.voice_id !== "string" || !payload.voice_id) {
    throw new Error("elevenlabs_create_no_voice_id");
  }
  return payload.voice_id;
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return;

  // 404 means it is already gone, which is the state the caller wanted.
  const res = await fetch(`${API_BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`elevenlabs_delete_${res.status}`);
  }
}

/**
 * Looks up the ElevenLabs account's own default voice. Used as the fallback when
 * a creator has no consented clone, so an alert still speaks instead of going
 * silent.
 */
export async function fetchDefaultVoiceId(): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  const payload = (await res.json()) as {
    voices?: { voice_id?: string; category?: string }[];
  };
  const shared = payload.voices?.find((v) => v.category === "premade");
  return shared?.voice_id ?? null;
}

export function admin() {
  return createAdminClient();
}