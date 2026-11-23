import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/dashboard/widgets/alerts/page.tsx", "utf8");

test("dashboard alert preview is not labeled as a live overlay", () => {
  assert.match(source, /ON-SCREEN ALERT PREVIEW/);
  assert.match(source, /DASHBOARD PREVIEW/);
  assert.doesNotMatch(source, /LIVE OVERLAY MOCK/);
});
