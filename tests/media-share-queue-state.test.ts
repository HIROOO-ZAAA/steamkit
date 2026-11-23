import assert from "node:assert/strict";
import test from "node:test";
import { mediaShareQueueState } from "../src/lib/dashboard/media-share-queue-state.ts";

test("media queue distinguishes loading, error, empty, and ready data", () => {
  assert.equal(mediaShareQueueState(true, false, 0), "loading");
  assert.equal(mediaShareQueueState(false, true, 0), "error");
  assert.equal(mediaShareQueueState(false, false, 0), "empty");
  assert.equal(mediaShareQueueState(false, false, 2), "ready");
});

test("a failed refresh is reported instead of presenting old rows as current", () => {
  assert.equal(mediaShareQueueState(false, true, 2), "error");
});
