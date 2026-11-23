import test from "node:test";
import assert from "node:assert/strict";
import {
  getSetupReadiness,
  getSelectedCloneReadiness,
} from "../src/lib/setup-guide-readiness.ts";

test("selected clone readiness matches the actual cloned-speech requirements", () => {
  const speakableClone = {
    id: "clone-1",
    consentAt: "2026-10-20T00:00:00Z",
    voiceStudioVoiceId: "provider-voice-1",
  };

  assert.equal(getSelectedCloneReadiness(true, "clone-1", [speakableClone]), "ready");
  assert.equal(
    getSelectedCloneReadiness(true, "clone-1", [
      { ...speakableClone, voiceStudioVoiceId: null },
    ]),
    "needs_setup",
  );
  assert.equal(
    getSelectedCloneReadiness(true, "clone-1", [
      { ...speakableClone, consentAt: null },
    ]),
    "needs_setup",
  );
  assert.equal(getSelectedCloneReadiness(true, "missing", [speakableClone]), "needs_setup");
  assert.equal(getSelectedCloneReadiness(false, "clone-1", [speakableClone]), "not_selected");
  assert.equal(getSelectedCloneReadiness(true, null, [speakableClone]), "not_selected");
});

test("setup readiness marks saved account capabilities without claiming live connectivity", () => {
  const items = getSetupReadiness({
    profile: { username: "creator", displayName: "Creator" },
    profileUnavailable: false,
    overlayCredentialExists: true,
    overlayUnavailable: false,
    selectedCloneReadiness: "ready",
    voiceUnavailable: false,
    telegramGroupLinked: true,
    telegramUnavailable: false,
  });

  assert.equal(items.find((item) => item.id === "profile")?.status, "ready");
  assert.equal(items.find((item) => item.id === "overlay")?.status, "ready");
  assert.equal(items.find((item) => item.id === "voice-clone")?.status, "ready");
  assert.equal(items.find((item) => item.id === "telegram")?.status, "ready");
  assert.equal(items.find((item) => item.id === "payment-methods")?.status, "review");
  assert.match(items.find((item) => item.id === "overlay")?.detail ?? "", /OBS playback is not verified/);
});

test("incomplete and optional setup states remain distinct", () => {
  const items = getSetupReadiness({
    profile: { username: null, displayName: "Creator" },
    profileUnavailable: false,
    overlayCredentialExists: false,
    overlayUnavailable: false,
    selectedCloneReadiness: "not_selected",
    voiceUnavailable: false,
    telegramGroupLinked: false,
    telegramUnavailable: false,
  });

  assert.equal(items.find((item) => item.id === "profile")?.status, "needs_setup");
  assert.equal(items.find((item) => item.id === "tip-page")?.status, "needs_setup");
  assert.equal(items.find((item) => item.id === "overlay")?.status, "needs_setup");
  assert.equal(items.find((item) => item.id === "voice-clone")?.status, "optional");
  assert.equal(items.find((item) => item.id === "telegram")?.status, "optional");
});

test("an unusable selected clone is a setup problem, not an optional feature", () => {
  const items = getSetupReadiness({
    profile: { username: "creator", displayName: "Creator" },
    profileUnavailable: false,
    overlayCredentialExists: true,
    overlayUnavailable: false,
    selectedCloneReadiness: "needs_setup",
    voiceUnavailable: false,
    telegramGroupLinked: false,
    telegramUnavailable: false,
  });

  const clone = items.find((item) => item.id === "voice-clone");
  assert.equal(clone?.status, "needs_setup");
  assert.match(clone?.detail ?? "", /not ready to speak/);
  assert.equal(clone?.href, "/dashboard/voice-settings");
});

test("failed status queries are reported as unavailable instead of incomplete", () => {
  const items = getSetupReadiness({
    profile: null,
    profileUnavailable: true,
    overlayCredentialExists: false,
    overlayUnavailable: true,
    selectedCloneReadiness: "not_selected",
    voiceUnavailable: true,
    telegramGroupLinked: false,
    telegramUnavailable: true,
  });

  assert.equal(items.find((item) => item.id === "profile")?.status, "unavailable");
  assert.equal(items.find((item) => item.id === "tip-page")?.status, "unavailable");
  assert.equal(items.find((item) => item.id === "overlay")?.status, "unavailable");
  assert.equal(items.find((item) => item.id === "voice-clone")?.status, "unavailable");
  assert.equal(items.find((item) => item.id === "telegram")?.status, "unavailable");
});
