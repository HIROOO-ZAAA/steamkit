import "server-only";

/**
 * VoiceStudio voice cloning provider.
 *
 * Connected to self-hosted VoiceStudio (github.com/debpalash/VoiceStudio).
 * Supports public reverse-proxy tunnels (Cloudflare Tunnel) or localhost.
 *
 * Cloned voices are created via POST /profiles with kind='clone' and ref_audio.
 * Deletion is handled via DELETE /profiles/{profile_id}.
 */

const UPLOAD_TIMEOUT_MS = 60_000;

/** VoiceStudio accepted audio containers */
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

/** Safe upload limits */
const MAX_BYTES = 25_000_000;
const MIN_BYTES = 5_000;

/** Alert lines, capped. Long enough for a template read-out, short enough to be free. */
const MAX_TEXT_LENGTH = 300;

function baseUrl(): string {
  return (process.env.VOICESTUDIO_BASE_URL ?? "").replace(/\/$/, "");
}

/**
 * The instance's `OMNIVOICE_API_KEY`, sent as a bearer token.
 *
 * VoiceStudio refuses any request addressed to a host name it does not
 * recognise — a Cloudflare tunnel name is never one — unless the request
 * presents this key or arrives over localhost/an IP. Nothing else can supply
 * it: no reverse proxy rewrites headers in front of the instance, and the
 * backend ignores any header it does not recognise, so a plausible-looking
 * `X-Internal-Key` is indistinguishable from sending nothing.
 */
function sharedSecret(): string {
  return (process.env.VOICESTUDIO_SHARED_SECRET ?? "").trim();
}

function authHeaders(): Record<string, string> {
  const secret = sharedSecret();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export function voiceStudioConfigured(): boolean {
  return Boolean(baseUrl());
}

/**
 * A non-2xx answer from VoiceStudio, keeping the status so callers can tell a
 * refusal apart from a sample the instance did not like.
 */
export class VoiceStudioError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail ? `voicestudio_${status}: ${detail}` : `voicestudio_${status}`);
    this.name = "VoiceStudioError";
  }

  /**
   * 401/403 is a request refused before it reached the provider's own logic: a
   * missing or mismatched key, or a host name the instance does not recognise.
   * Re-recording the sample cannot change the answer, so callers must not
   * report it as bad audio.
   */
  get refused(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function providerError(res: Response): Promise<VoiceStudioError> {
  const detail = await res.text().catch(() => "");
  return new VoiceStudioError(res.status, detail.slice(0, 300));
}

/**
 * Confirms the bytes really are the audio container the declared MIME type claims.
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

  if (mime === "audio/webm") return startsWith(0x1a, 0x45, 0xdf, 0xa3);
  if (mime === "audio/ogg") return asciiAt(0, "OggS");
  if (mime === "audio/flac") return asciiAt(0, "fLaC");
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return asciiAt(4, "ftyp");
  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return (
      asciiAt(0, "ID3") ||
      (bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
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

/**
 * The upload ceiling in megabytes, so the refusal a creator reads and the number
 * the server enforces cannot drift apart. They already had: the limit was 25 MB
 * and the message said 20, so a 22 MB sample was refused for being "over 20".
 */
export function maxUploadMegabytes(): number {
  return Math.round(MAX_BYTES / 1_000_000);
}

/**
 * Alert text on its way to the engine.
 *
 * Strips angle/bracket characters so a donor cannot smuggle markup into the
 * provider, collapses whitespace, and caps the length.
 */
export function sanitizeAlertText(raw: string): string {
  return raw
    .replace(/[<>{}[\]]/g, "") // strip SSML/markup injection attempts
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

/**
 * Minimal MP3/WAV magic-byte check on what the provider returned.
 *
 * The bytes come from VoiceStudio rather than a caller, so this is defence in
 * depth against a proxy or a misconfigured base URL quietly serving an error page
 * as audio. A cached HTML error page is otherwise played as a silent alert.
 */
export function looksLikeAudio(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf).subarray(0, 4);
  const isMp3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33; // "ID3"
  const isMp3Frame = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0; // MPEG frame sync
  const isWav = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // "RIFF"
  return isMp3 || isMp3Frame || isWav;
}

/**
 * Uploads a voice sample to VoiceStudio (/profiles) and returns the profile id.
 *
 * `refText` is optional but load-bearing: the engine transcribes the reference
 * clip itself when no transcript is supplied, and with no ASR model installed
 * that fails at synthesis time — after the clone has already been accepted and
 * stored. With one, the engine skips ASR entirely and the clip is capped at 20s
 * instead of 15.
 */
export async function createVoiceStudioVoice(
  name: string,
  sample: File,
  refText = "",
): Promise<string> {
  const url = baseUrl();

  const form = new FormData();
  form.append("name", name);
  form.append("kind", "clone");
  form.append("ref_text", refText);
  form.append(
    "ref_audio",
    new Blob([await sample.arrayBuffer()], { type: sample.type }),
    sample.name || "voice_clone.wav",
  );

  const res = await fetch(`${url}/profiles`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) throw await providerError(res);

  const payload = (await res.json()) as { id?: unknown; voice_id?: unknown };
  const voiceId =
    (typeof payload.id === "string" && payload.id) ||
    (typeof payload.voice_id === "string" && payload.voice_id);

  if (!voiceId) {
    throw new Error("voicestudio_create_no_voice_id");
  }
  return voiceId;
}

/**
 * Renders `text` in `voiceId` and returns the raw audio bytes.
 *
 * The caller's signal is passed through on purpose: an alert is on screen for
 * a few seconds, so a caller that gives up must abort the upstream request
 * rather than leave it running on the GPU.
 */
export async function synthesizeVoiceStudioSpeech(
  voiceId: string,
  text: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await fetch(`${baseUrl()}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      model: "omnivoice",
      input: text,
      voice: voiceId,
      response_format: "mp3",
    }),
    signal,
  });

  if (!res.ok) throw await providerError(res);
  return res.arrayBuffer();
}

/**
 * Deletes a voice profile from VoiceStudio.
 */
export async function deleteVoiceStudioVoice(voiceId: string): Promise<void> {
  const url = baseUrl();
  if (!url) return;

  const res = await fetch(`${url}/profiles/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok && res.status !== 404) {
    throw new VoiceStudioError(res.status, "");
  }
}
