import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasAudioSignature,
  looksLikeAudio,
  MAX_ALERT_TEXT_LENGTH,
  sanitizeAlertText,
} from "../src/lib/voice/audio-validation.ts";

/** Builds a buffer from ASCII text, which is how most magic numbers read. */
const ascii = (text: string): Uint8Array =>
  Uint8Array.from(text, (ch) => ch.charCodeAt(0));

/**
 * Fixtures are built from explicit byte values rather than padded string
 * literals. A container header is "RIFF" + a 4-byte length + "WAVE", and
 * writing that as a single string literal depends on the padding surviving the
 * write at all. It does not, silently, and the resulting test then fails — or
 * worse, passes for the wrong reason because the padding became NUL bytes.
 */
const weaver = (bytes: number[], length = 32): Uint8Array => {
  const out = new Uint8Array(length);
  out.set(bytes.slice(0, length));
  return out;
};

/** Real container headers, byte-for-byte as ffmpeg emits them. */
const WEBM = weaver([0x1a, 0x45, 0xdf, 0xa3]); // EBML
const OGG = ascii("OggS"); // Ogg capture pattern
const FLAC = ascii("fLaC"); // FLAC stream marker
const MP4 = weaver([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // box length + "ftyp"
const MP3_ID3 = weaver([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]); // "ID3" + tag size
const MP3_FRAME = weaver([0xff, 0xfb, 0x90, 0x00]); // frame sync, no tag
const WAV = weaver([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x08, 0x00, 0x00, // chunk size
  0x57, 0x41, 0x56, 0x45, // "WAVE" at offset 8
  0x66, 0x6d, 0x74, 0x20, // "fmt "
]);
const HTML = ascii("<!DOCTYPE html><html>");

describe("hasAudioSignature — accepts the container it claims", () => {
  it("matches WebM on the EBML header", () => {
    assert.equal(hasAudioSignature(WEBM, "audio/webm"), true);
  });

  it("matches Ogg on the capture pattern", () => {
    assert.equal(hasAudioSignature(OGG, "audio/ogg"), true);
  });

  it("matches FLAC on the stream marker", () => {
    assert.equal(hasAudioSignature(FLAC, "audio/flac"), true);
  });

  it("matches mp4 and its x-m4a alias on the ftyp box", () => {
    assert.equal(hasAudioSignature(MP4, "audio/mp4"), true);
    assert.equal(hasAudioSignature(MP4, "audio/x-m4a"), true);
  });

  it("matches mp3 with an ID3 tag", () => {
    assert.equal(hasAudioSignature(MP3_ID3, "audio/mp3"), true);
    assert.equal(hasAudioSignature(MP3_ID3, "audio/mpeg"), true);
  });

  it("matches a bare MPEG frame sync when there is no ID3 tag", () => {
    assert.equal(hasAudioSignature(MP3_FRAME, "audio/mpeg"), true);
  });

  it("matches wav and its x-wav alias on RIFF + WAVE", () => {
    assert.equal(hasAudioSignature(WAV, "audio/wav"), true);
    assert.equal(hasAudioSignature(WAV, "audio/x-wav"), true);
  });
});

describe("hasAudioSignature — refuses a mismatched declaration", () => {
  // The gap this module closed: the donor route used to OR WebM and Ogg into a
  // single branch, so either body satisfied either declaration and was then
  // stored under the wrong extension.
  it("rejects Ogg bytes declared as WebM", () => {
    assert.equal(hasAudioSignature(OGG, "audio/webm"), false);
  });

  it("rejects WebM bytes declared as Ogg", () => {
    assert.equal(hasAudioSignature(WEBM, "audio/ogg"), false);
  });

  it("rejects FLAC bytes declared as WebM", () => {
    assert.equal(hasAudioSignature(FLAC, "audio/webm"), false);
  });

  it("rejects an HTML error page under every accepted type", () => {
    for (const mime of [
      "audio/webm",
      "audio/ogg",
      "audio/flac",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
    ]) {
      assert.equal(hasAudioSignature(HTML, mime), false, `${mime} accepted an HTML body`);
    }
  });

  it("rejects types it has no signature for", () => {
    assert.equal(hasAudioSignature(WEBM, "audio/aac"), false);
    assert.equal(hasAudioSignature(WEBM, ""), false);
    assert.equal(hasAudioSignature(WEBM, "application/octet-stream"), false);
  });

  it("is case-sensitive on the MIME type, like the allowlists are", () => {
    assert.equal(hasAudioSignature(WEBM, "AUDIO/WEBM"), false);
  });
});

describe("hasAudioSignature — rejects truncated input", () => {
  // A magic number proves the body *starts* like the container it claims; it
  // says nothing about the rest decoding. What is guaranteed here is that a
  // buffer too short to hold the signature never matches on the bytes it
  // happens to have.
  it("rejects an empty buffer for every type", () => {
    for (const mime of ["audio/webm", "audio/ogg", "audio/flac", "audio/mp4", "audio/wav"]) {
      assert.equal(hasAudioSignature(new Uint8Array(0), mime), false, `${mime} matched empty`);
    }
  });

  it("rejects a WebM header cut short", () => {
    assert.equal(hasAudioSignature(weaver([0x1a, 0x45]), "audio/webm"), false);
    assert.equal(hasAudioSignature(weaver([0x1a, 0x45, 0xdf]), "audio/webm"), false);
  });

  it("rejects an Ogg capture pattern cut short", () => {
    assert.equal(hasAudioSignature(ascii("Ogg"), "audio/ogg"), false);
  });

  it("rejects mp4 whose ftyp box falls outside the buffer", () => {
    assert.equal(hasAudioSignature(weaver([0x00, 0x00, 0x00]), "audio/mp4"), false);
    assert.equal(
      hasAudioSignature(weaver([0x00, 0x00, 0x00, 0x18, 0x66, 0x74]), "audio/mp4"),
      false,
    );
  });

  it("rejects a lone 0xff byte as an MPEG frame", () => {
    assert.equal(hasAudioSignature(weaver([0xff]), "audio/mpeg"), false);
  });

  it("rejects a RIFF container with no WAVE form type", () => {
    assert.equal(
      hasAudioSignature(weaver([0x52, 0x49, 0x46, 0x46, 0x24, 0x08, 0x00, 0x00]), "audio/wav"),
      false,
    );
  });

  it("rejects a WAVE form type in the wrong position", () => {
    assert.equal(
      hasAudioSignature(
        weaver([0x57, 0x41, 0x56, 0x45, 0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
        "audio/wav",
      ),
      false,
    );
  });
});

describe("sanitizeAlertText", () => {
  it("strips markup and bracket characters", () => {
    assert.equal(sanitizeAlertText("<script>alert(1)</script>"), "scriptalert(1)/script");
  });

  it("collapses runs of whitespace", () => {
    assert.equal(sanitizeAlertText("thank   you\n\n  again"), "thank you again");
  });

  it("trims and returns empty for whitespace-only input", () => {
    assert.equal(sanitizeAlertText("   "), "");
  });

  it("caps the length", () => {
    const long = "a".repeat(MAX_ALERT_TEXT_LENGTH + 100);
    assert.equal(sanitizeAlertText(long).length, MAX_ALERT_TEXT_LENGTH);
  });

  it("keeps ordinary Khmer text and punctuation untouched", () => {
    assert.equal(sanitizeAlertText("អរគុណ Nget! 50$"), "អរគុណ Nget! 50$");
  });
});

describe("looksLikeAudio — provider output", () => {
  const toBuf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(0) as ArrayBuffer;

  it("accepts an ID3-tagged mp3", () => {
    assert.equal(looksLikeAudio(toBuf(ascii("ID3"))), true);
  });

  it("accepts a bare MPEG frame sync", () => {
    assert.equal(looksLikeAudio(toBuf(weaver([0xff, 0xfb]))), true);
  });

  it("accepts a RIFF/WAVE payload", () => {
    assert.equal(looksLikeAudio(toBuf(ascii("RIFF"))), true);
  });

  it("rejects the HTML page a proxy returns on error", () => {
    assert.equal(looksLikeAudio(toBuf(HTML)), false);
  });

  it("rejects a JSON error body", () => {
    assert.equal(looksLikeAudio(toBuf(ascii('{"detail"'))), false);
  });

  it("rejects a buffer too short to hold any signature", () => {
    assert.equal(looksLikeAudio(toBuf(new Uint8Array(0))), false);
    assert.equal(looksLikeAudio(toBuf(weaver([0x49]))), false);
  });
});