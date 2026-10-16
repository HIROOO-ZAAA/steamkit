/**
 * Audio format validation shared by every audio upload path.
 *
 * Deliberately dependency-free and free of `import "server-only"` so plain
 * `node --test` can import it. Two things forced that split:
 *   - `server-only` throws when imported outside a React Server Component,
 *     which is every test runner; and
 *   - Node strips TypeScript types but cannot compile constructor parameter
 *     properties, so a module containing those cannot be imported at all.
 *
 * WHAT LIVES HERE
 *   The signature table — one declared MIME type, one required magic number.
 *   Before this existed, `api/donation-voice` matched WebM and Ogg against a
 *   single OR'd branch, so an Ogg payload declared as `audio/webm` passed
 *   validation (and was then stored with a `.webm` extension). Detection is
 *   now strictly type-to-type.
 *
 * WHAT DELIBERATELY DOES NOT LIVE HERE
 *   The MIME allowlists. They are not the same list and must not be unified:
 *   `lib/voice/voicestudio.ts` allows what the VoiceStudio provider accepts,
 *   while `api/donation-voice` allows what the `donation-voice` bucket's
 *   `allowed_mime_types` permits. Merging them would silently widen or narrow
 *   an upload path; each consumer keeps its own list and shares only the
 *   detection logic.
 *
 * LIMITATION, STATED PLAINLY
 *   A magic number proves the body *starts* like the container it claims. It
 *   does not prove the file decodes or is not truncated further in. This is a
 *   cheap guard against an HTML error page being served as audio, not a decoder.
 *   Size floors (see each route) and, for donor uploads, the browser-reported
 *   duration remain the outer bounds.
 */

/** Alert lines are capped: long enough for a template read-out, short enough to be cheap. */
export const MAX_ALERT_TEXT_LENGTH = 300;

const startsWith = (bytes: Uint8Array, ...sig: number[]): boolean =>
  sig.every((byte, i) => bytes[i] === byte);

/**
 * Reads ASCII `text` at `offset`, or false when the buffer is too short to hold
 * it — a truncated file must not read as a match on the bytes it does have.
 */
const asciiAt = (bytes: Uint8Array, offset: number, text: string): boolean => {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/** An MPEG audio frame begins with 11 set sync bits. */
const isMpegFrameSync = (bytes: Uint8Array): boolean =>
  bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;

/**
 * Declared MIME type -> the byte signature that type must have.
 *
 * Aliases share a detector (`mp3`/`mpeg`, `wav`/`x-wav`, `mp4`/`x-m4a`) because
 * they name the same container. Everything else maps one-to-one, which is the
 * entire point: a body whose magic belongs to a *sibling* container is refused.
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  // Matroska / WebM: EBML header.
  "audio/webm": (b) => startsWith(b, 0x1a, 0x45, 0xdf, 0xa3),
  // Ogg: "OggS" capture pattern.
  "audio/ogg": (b) => asciiAt(b, 0, "OggS"),
  // FLAC: "fLaC" stream marker.
  "audio/flac": (b) => asciiAt(b, 0, "fLaC"),
  // ISO base media (m4a): a "ftyp" box, which starts at offset 4 because the
  // first four bytes are the box length.
  "audio/mp4": (b) => asciiAt(b, 4, "ftyp"),
  "audio/x-m4a": (b) => asciiAt(b, 4, "ftyp"),
  // MP3: an "ID3" tag, or a bare frame sync when there is no tag.
  "audio/mpeg": (b) => asciiAt(b, 0, "ID3") || isMpegFrameSync(b),
  "audio/mp3": (b) => asciiAt(b, 0, "ID3") || isMpegFrameSync(b),
  // WAV: "RIFF" container followed by "WAVE" form type at offset 8.
  "audio/wav": (b) => asciiAt(b, 0, "RIFF") && asciiAt(b, 8, "WAVE"),
  "audio/x-wav": (b) => asciiAt(b, 0, "RIFF") && asciiAt(b, 8, "WAVE"),
};

/**
 * Confirms the bytes really are the container the declared MIME type claims.
 *
 * The MIME type arrives from the client, so on its own it proves nothing — this
 * is what stops an HTML error page being stored or served as audio.
 */
export function hasAudioSignature(bytes: Uint8Array, mime: string): boolean {
  const detector = SIGNATURES[mime];
  return detector ? detector(bytes) : false;
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
    .slice(0, MAX_ALERT_TEXT_LENGTH);
}

/**
 * Minimal MP3/WAV magic-byte check on what a provider returned.
 *
 * The bytes come from VoiceStudio rather than a caller, so this is defence in
 * depth against a proxy or a misconfigured base URL quietly serving an error
 * page as audio — otherwise a cached HTML page plays as a silent alert.
 */
export function looksLikeAudio(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf).subarray(0, 4);
  const isMp3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33; // "ID3"
  const isMp3Frame = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0; // MPEG frame sync
  const isWav = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // "RIFF"
  return isMp3 || isMp3Frame || isWav;
}