import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/dashboard/widget-overlays/page.tsx", "utf8");
const leaderboardSource = readFileSync("src/app/dashboard/widgets/leaderboard/page.tsx", "utf8");

test("widget test donation discloses its account-wide, persistent test-history behavior", () => {
  assert.match(source, /records one TEST donation in your account/);
  assert.match(source, /every active widget showing donation history/);
  assert.match(source, /record stays in Donation History/);
  assert.match(source, /clearing a widget only resets that widget/);
  assert.match(source, /Check your active OBS sources to confirm where it appears/);
  assert.doesNotMatch(source, /mock layout will appear on your OBS widget for 1 minute/);
  assert.doesNotMatch(source, /Test donation sent to OBS/);
});

test("widget save feedback describes persistence and polling instead of claiming live delivery", () => {
  assert.match(source, /Widget settings saved\. The overlay checks for changes every 2 seconds/);
  assert.doesNotMatch(source, /Widget saved\. OBS overlay updated/);
});

test("leaderboard builders expose cross-links without merging their storage", () => {
  assert.match(source, /href="\/dashboard\/widgets\/leaderboard"/);
  assert.match(leaderboardSource, /href="\/dashboard\/widget-overlays"/);
  assert.match(source, /leaderboard_widget/);
  assert.match(leaderboardSource, /widget_settings/);
});
