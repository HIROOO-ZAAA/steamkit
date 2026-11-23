import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardDisplayName } from "../src/lib/dashboard/display-name.ts";

test("dashboard greeting prefers the creator's saved display name", () => {
  assert.equal(
    getDashboardDisplayName(
      { display_name: "  Mira Streamer  ", username: "mira_live" },
      "mira@example.com",
    ),
    "Mira Streamer",
  );
});

test("dashboard greeting falls back to username, email name, then Creator", () => {
  assert.equal(
    getDashboardDisplayName({ display_name: " ", username: "mira_live" }),
    "mira_live",
  );
  assert.equal(getDashboardDisplayName(null, "mira@example.com"), "mira");
  assert.equal(getDashboardDisplayName(null, " "), "Creator");
});
