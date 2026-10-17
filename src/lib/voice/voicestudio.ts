import "server-only";

import {
  hasAudioSignature,
  looksLikeAudio,
  sanitizeAlertText,
} from "@/lib/voice/audio-validation";

/**
 * VoiceStudio voice cloning provider.
 *
 * Connected to self-hosted VoiceStudio (github.com/debpalash/VoiceStudio).
 * Supports public reverse-proxy tunnels (Cloudflare Tunnel) or localhost.
 *
 * Cloned voices are created via POST /profiles with kind='clone' and ref_audio.
 * Deletion is handled via DELETE /profiles/{profile_id}.
 *
 * Format detection, text sanitisation and the returned-audio check live in
 * ./audio-validation so `node --test` can import them: this module pulls in
 * `server-only` and uses a TypeScript constructor parameter property, and Node
 * can do neither. They are re-exported below so every existing import path
 * keeps working.
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

/** Re-exported so importers of this module keep working unchanged. */
export { hasAudioSignature, looksLikeAudio, sanitizeAlertText };

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
 * One synthesis at a time per process.
 *
 * VoiceStudio runs a GPU worker pool and on a creator's own card it is ONE
 * worker. It refuses overlapping work with:
 *
 *   `the local GPU worker pool is saturated (0 running, 1 already queued on
 *   1 worker(s))`
 *
 * Aborting our fetch does NOT cancel the work either — the instance keeps
 * synthesising for whoever walked away, holding the worker for the rest of its
 * natural runtime. So a timeout is worse than it looks: it converts a slow
 * alert into a queue of abandoned jobs that starve every alert after it.
 *
 * This lives in the provider layer rather than in one route on purpose. There
 * are two callers that synthesise — the overlay route and the dashboard's
 * clone preview — and a gate that only one of them respects is not a gate: the
 * measured `saturated` bursts came from previewing a clone while the overlay
 * was mid-alert.
 *
 * Best effort and per-process. It does not coordinate across serverless
 * instances, which is why a timeout must still not retry: on another instance
 * the gate is not there to protect the worker.
 */
let synthesisChain: Promise<unknown> = Promise.resolve();

export function onTheProvider<T>(fn: () => Promise<T>): Promise<T> {
  const result = synthesisChain.then(fn, fn);
  // Keep the chain alive whatever the outcome, and never hand the next caller
  // the previous caller's rejection.
  synthesisChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Renders `text` in `voiceId` and returns the raw audio bytes.
 *
 * The caller's signal is passed through on purpose: an alert is on screen for
 * a few seconds, so a caller that gives up must abort the upstream request
 * rather than leave it running on the GPU.
 *
 * Queued behind `onTheProvider`. The caller owns the clock either way — the
 * queue only stops us piling onto a one-worker pool, it does not extend a
 * caller's deadline.
 */
export async function synthesizeVoiceStudioSpeech(
  voiceId: string,
  text: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  return onTheProvider(async () => {
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
  });
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
