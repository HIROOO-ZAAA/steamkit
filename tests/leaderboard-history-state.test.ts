import assert from "node:assert/strict";
import test from "node:test";
import {
  getLeaderboardHistoryState,
  getLeaderboardSince,
} from "../src/lib/leaderboard-history-state.ts";

test("leaderboard history distinguishes loading, failure, empty, and populated states", () => {
  assert.equal(
    getLeaderboardHistoryState({ loading: true, failed: false, entryCount: 0 }),
    "loading",
  );
  assert.equal(
    getLeaderboardHistoryState({ loading: false, failed: true, entryCount: 0 }),
    "error",
  );
  assert.equal(
    getLeaderboardHistoryState({ loading: false, failed: false, entryCount: 0 }),
    "empty",
  );
  assert.equal(
    getLeaderboardHistoryState({ loading: false, failed: false, entryCount: 3 }),
    "ready",
  );
});

test("leaderboard period filters send the selected rolling time window", () => {
  const now = Date.UTC(2026, 9, 23, 12);
  assert.equal(getLeaderboardSince("all", now), null);
  assert.equal(
    getLeaderboardSince("30d", now),
    new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(
    getLeaderboardSince("7d", now),
    new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
});
