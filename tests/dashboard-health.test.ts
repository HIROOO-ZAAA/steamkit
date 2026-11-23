import assert from "node:assert/strict";
import test from "node:test";
import { eventStatusLabel, savedTtsEnabled, telegramBridgeSnapshot, ttsHealthSnapshot } from "../src/lib/dashboard/health.ts";

test("saved TTS state aggregates alert settings across tiers", () => {
  assert.equal(savedTtsEnabled([]), null);
  assert.equal(savedTtsEnabled([{ tts_enabled: false }, { tts_enabled: false }]), false);
  assert.equal(savedTtsEnabled([{ tts_enabled: false }, { tts_enabled: true }]), true);
  assert.equal(savedTtsEnabled([{ tts_enabled: null }]), true);
});

test("Telegram health distinguishes active, setup, error, and unreachable states", () => {
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "listening" }).level, "healthy");
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "qr" }).level, "degraded");
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "groups", hasError: true }).level, "degraded");
  assert.equal(telegramBridgeSnapshot({ reachable: false }).level, "unknown");
});

test("an attached listener outranks a transitional status", () => {
  // The bridge reports `listening` as an object, never a boolean. A no-op
  // POST /configure used to leave `status` stuck on "starting" while a handler
  // was genuinely attached, which graded a healthy bridge as "Not listening".
  const attached = { chatId: "-1004492023589", botUsername: "@PayWayByABA_bot" };
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "starting", listening: attached }).level, "healthy");
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "starting", listening: attached }).label, "Listening");
  // Transitional with nothing attached is still not listening.
  assert.equal(telegramBridgeSnapshot({ reachable: true, status: "starting", listening: null }).level, "degraded");
});

test("Telegram diagnostics never expose the bridge's private error text", () => {
  const result = telegramBridgeSnapshot({
    reachable: true,
    status: "error",
    hasError: true,
  });
  assert.equal(result.detail.includes("QR"), false);
  assert.equal(result.detail.includes("token"), false);
  assert.equal(result.detail, "The bridge reports an error. Private bridge details are hidden.");
});

test("event statuses map to a small safe vocabulary", () => {
  assert.deepEqual(eventStatusLabel("successful"), { label: "Completed", level: "healthy" });
  assert.deepEqual(eventStatusLabel("test"), { label: "Test alert", level: "healthy" });
  assert.deepEqual(eventStatusLabel("failed"), { label: "Failed", level: "degraded" });
  assert.deepEqual(eventStatusLabel("private raw string"), { label: "Unknown", level: "unknown" });
});

test("TTS health points to clone selection when no clone is selected", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "not_selected",
    observation: { stage: "audio_ready", result: "audio", voiceSource: "clone" },
    detail: "Audio was returned earlier.",
  });
  assert.equal(state.level, "degraded");
  assert.equal(state.label, "No clone selected");
  assert.match(state.detail, /Voice Settings/);
});

test("TTS health distinguishes an unreadable clone selection from no selection", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "unknown",
    observation: null,
    detail: "No result yet.",
  });
  assert.equal(state.level, "unknown");
  assert.equal(state.label, "Clone selection unknown");
});

test("TTS health calls a selected but unusable clone a setup problem", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "needs_setup",
    observation: null,
    detail: "No result yet.",
  });
  assert.equal(state.level, "degraded");
  assert.equal(state.label, "Selected clone not ready");
  assert.match(state.detail, /VoiceStudio voice ID/);
});

test("clone audio is ready only after the selected clone is verified", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "ready",
    observation: { stage: "audio_ready", result: "audio", voiceSource: "clone" },
    detail: "Most recent synthesis result observed by this application process.",
  });
  assert.equal(state.level, "healthy");
  assert.equal(state.label, "Clone audio ready");
  assert.match(state.detail, /does not confirm that OBS played it audibly/);
});

test("provider audio is not reported ready before it is validated and stored", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "ready",
    observation: { stage: "provider_audio", result: "audio", voiceSource: "clone" },
    detail: "Provider returned audio.",
  });
  assert.equal(state.level, "unknown");
  assert.equal(state.label, "Audio received, preparing playback");
});

test("fallback output is not reported as cloned voice output", () => {
  const state = ttsHealthSnapshot({
    configured: true,
    enabled: true,
    cloneReadiness: "ready",
    observation: { stage: "audio_ready", result: "audio", voiceSource: "fallback" },
    detail: "Fallback audio was prepared.",
  });
  assert.equal(state.level, "degraded");
  assert.equal(state.label, "Fallback audio ready");
  assert.match(state.detail, /selected clone was not used/);
});
