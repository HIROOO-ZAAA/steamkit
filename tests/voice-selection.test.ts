import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectedCloneId } from "../src/lib/voice/clone-selection.ts";
import { canUseBrowserVoiceFallback } from "../src/lib/overlay/speech-policy.ts";
import {
  ALERT_TTS_BROWSER_TIMEOUT_MS,
  ALERT_TTS_GENERATION_TIMEOUT_MS,
  ALERT_TTS_ROUTE_MAX_DURATION_SECONDS,
  ttsGenerationFailureStatus,
} from "../src/lib/voice/tts-timeouts.ts";

describe("saved alert voice selection", () => {
  it("uses only the enabled persisted clone", () => {
    const settings = { cloning_enabled: true, active_clone_id: "saved-clone" };
    assert.equal(selectedCloneId(settings), "saved-clone");
    assert.equal(selectedCloneId({ ...settings, cloning_enabled: false }), null);
    assert.equal(selectedCloneId({ cloning_enabled: true, active_clone_id: null }), null);
    assert.equal(selectedCloneId(null), null);
  });

  it("never substitutes a browser voice for a selected clone", () => {
    assert.equal(canUseBrowserVoiceFallback(true), false);
    assert.equal(canUseBrowserVoiceFallback(false), true);
  });

  it("keeps provider, browser, and route deadlines in order with cold-start headroom", () => {
    assert.ok(ALERT_TTS_GENERATION_TIMEOUT_MS >= 40_000);
    assert.ok(ALERT_TTS_GENERATION_TIMEOUT_MS < ALERT_TTS_ROUTE_MAX_DURATION_SECONDS * 1000);
    assert.ok(ALERT_TTS_BROWSER_TIMEOUT_MS > ALERT_TTS_ROUTE_MAX_DURATION_SECONDS * 1000);
    assert.equal(ttsGenerationFailureStatus(true), 504);
    assert.equal(ttsGenerationFailureStatus(false), 502);
  });
});
