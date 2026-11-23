import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/dashboard/widgets/media-share/page.tsx", "utf8");
const readRoute = readFileSync(
  "src/app/api/dashboard/media-share/queue/route.ts",
  "utf8",
);
const skipRoute = readFileSync(
  "src/app/api/dashboard/media-share/queue/[id]/skip/route.ts",
  "utf8",
);

test("Media Share dashboard uses authenticated routes instead of direct broad table reads", () => {
  assert.match(page, /fetch\("\/api\/dashboard\/media-share\/queue"/);
  assert.match(page, /\/api\/dashboard\/media-share\/queue\/\$\{encodeURIComponent\(id\)\}\/skip/);
  assert.doesNotMatch(page, /from\("media_share_queue"\)/);
});

test("Media Share queue updates are announced and repeated skip controls have context", () => {
  assert.match(page, /aria-label="Pending media requests" aria-live="polite" aria-busy=\{loading\}/);
  assert.match(page, /aria-label=\{`\$\{skippingId === item\.id \? "Skipping" : "Skip"\} video request from \$\{item\.tipper_name \|\| "supporter"\}`\}/);
});

test("Media Share API scopes reads and skips to the authenticated creator", () => {
  assert.match(readRoute, /sessionClient\.auth\.getUser\(\)/);
  assert.match(readRoute, /\.select\("id, tipper_name, youtube_url, duration_seconds"\)\s*\.eq\("creator_id", user\.id\)/);
  assert.match(skipRoute, /sessionClient\.auth\.getUser\(\)/);
  assert.match(skipRoute, /\.eq\("id", id\)\s*\.eq\("creator_id", user\.id\)\s*\.eq\("status", "pending"\)/);
  assert.doesNotMatch(readRoute, /\.select\("\*"\)/);
});
