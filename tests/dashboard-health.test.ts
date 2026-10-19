import assert from "node:assert/strict";
import test from "node:test";
import { eventStatusLabel, telegramBridgeSnapshot } from "../src/lib/dashboard/health.ts";

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
