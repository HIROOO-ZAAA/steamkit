import assert from "node:assert/strict";
import test from "node:test";
import { isDonationVoicePath } from "../src/lib/voice/donation-voice-path.ts";

test("accepts server-generated UUID v4 voice filenames", () => {
  for (const extension of ["webm", "ogg", "m4a", "mp3", "wav"]) {
    assert.equal(
      isDonationVoicePath(`550e8400-e29b-41d4-a716-446655440000.${extension}`),
      true,
    );
  }
});

test("rejects paths, traversal, and unsupported extensions", () => {
  for (const value of [
    "../550e8400-e29b-41d4-a716-446655440000.mp3",
    "/550e8400-e29b-41d4-a716-446655440000.mp3",
    "folder/550e8400-e29b-41d4-a716-446655440000.mp3",
    "550e8400-e29b-41d4-a716-446655440000.mp3/other",
    "550e8400-e29b-41d4-a716-446655440000.exe",
    "not-a-uuid.mp3",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isDonationVoicePath(value), false, String(value));
  }
});

test("rejects UUIDs that were not generated as UUID v4", () => {
  assert.equal(
    isDonationVoicePath("550e8400-e29b-11d4-a716-446655440000.mp3"),
    false,
  );
});
