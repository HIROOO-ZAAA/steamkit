import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAuthorizedDonationVoicePath } from "../src/lib/voice/donation-voice-access.ts";

const creatorId = "creator-123";
const voicePath = "123e4567-e89b-42d3-a456-426614174000.mp3";

function makeTip(overrides: Record<string, unknown> = {}) {
  return {
    creator_id: creatorId,
    payment_status: "successful",
    voice_path: voicePath,
    ...overrides,
  };
}

describe("donation voice access", () => {
  it("allows a successful donation owned by the overlay creator", () => {
    assert.equal(
      getAuthorizedDonationVoicePath(makeTip(), creatorId),
      voicePath,
    );
  });

  it("allows a test donation owned by the overlay creator", () => {
    assert.equal(
      getAuthorizedDonationVoicePath(
        makeTip({ payment_status: "test" }),
        creatorId,
      ),
      voicePath,
    );
  });

  it("rejects a donation owned by another creator", () => {
    assert.equal(
      getAuthorizedDonationVoicePath(
        makeTip({ creator_id: "another-creator" }),
        creatorId,
      ),
      null,
    );
  });

  it("rejects missing tips and missing creator identifiers", () => {
    assert.equal(getAuthorizedDonationVoicePath(null, creatorId), null);
    assert.equal(getAuthorizedDonationVoicePath(makeTip(), ""), null);
  });

  it("rejects payment statuses that are not successful or test", () => {
    for (const payment_status of [
      "pending",
      "processing",
      "failed",
      "expired",
      "cancelled",
      "review_required",
    ]) {
      assert.equal(
        getAuthorizedDonationVoicePath(
          makeTip({ payment_status }),
          creatorId,
        ),
        null,
        `unexpectedly allowed status: ${payment_status}`,
      );
    }
  });

  it("rejects missing or invalid voice paths", () => {
    for (const voice_path of [
      null,
      "",
      "https://example.com/audio.mp3",
      "../private/audio.mp3",
      "folder/123e4567-e89b-42d3-a456-426614174000.mp3",
      "123e4567-e89b-12d3-a456-426614174000.mp3",
      "123e4567-e89b-42d3-a456-426614174000.exe",
    ]) {
      assert.equal(
        getAuthorizedDonationVoicePath(
          makeTip({ voice_path }),
          creatorId,
        ),
        null,
        `unexpectedly allowed path: ${String(voice_path)}`,
      );
    }
  });
});
