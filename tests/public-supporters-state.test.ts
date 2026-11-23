import assert from "node:assert/strict";
import test from "node:test";
import { getPublicSupportersState } from "../src/lib/public-supporters-state.ts";

test("a supporter query failure is not shown as an empty leaderboard", () => {
  assert.equal(getPublicSupportersState(true, 0), "unavailable");
});

test("a successful empty result remains an honest empty state", () => {
  assert.equal(getPublicSupportersState(false, 0), "empty");
});

test("a successful populated result renders the leaderboard", () => {
  assert.equal(getPublicSupportersState(false, 3), "ready");
});
