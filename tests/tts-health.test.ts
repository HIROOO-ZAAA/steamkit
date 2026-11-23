import assert from "node:assert/strict";
import test from "node:test";
import { getTtsObservation, recordTtsObservation } from "../src/lib/voice/tts-health.ts";

test("TTS health records only bounded status metadata", () => {
  recordTtsObservation(
    "creator-a",
    { stage: "failed", result: "failed", voiceSource: "clone", failureKind: "provider", providerStatus: 504 },
    new Date("2026-10-18T10:00:00.000Z"),
  );
  assert.deepEqual(getTtsObservation("creator-a"), {
    at: "2026-10-18T10:00:00.000Z",
    stage: "failed",
    result: "failed",
    voiceSource: "clone",
    failureKind: "provider",
    providerStatus: 504,
  });
});

test("TTS health snapshots are copied and contain no alert text or identifiers", () => {
  recordTtsObservation("creator-a", { stage: "audio_ready", result: "audio", voiceSource: "clone" }, new Date("2026-10-18T10:01:00.000Z"));
  const snapshot = getTtsObservation("creator-a");
  assert.ok(snapshot);
  assert.equal("text" in snapshot, false);
  assert.equal("paymentId" in snapshot, false);
  assert.equal(snapshot.voiceSource, "clone");
  snapshot.stage = "failed";
  assert.equal(getTtsObservation("creator-a")?.stage, "audio_ready");
});

test("TTS observations are isolated per creator", () => {
  recordTtsObservation("creator-a", { stage: "audio_ready", result: "audio" });
  assert.equal(getTtsObservation("creator-b"), null);
});
