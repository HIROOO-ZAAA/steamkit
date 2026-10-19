import assert from "node:assert/strict";
import test from "node:test";
import {
  alertHistorySourceLabel,
  alertHistoryStatusClass,
  alertHistoryStatusLabel,
  normalizeAlertHistoryFilters,
} from "../src/lib/overlay/alert-history.ts";

test("history filters accept known values and bound page and search length", () => {
  assert.deepEqual(
    normalizeAlertHistoryFilters({ page: "999999", status: "failed", source: "aba", q: "aba_%" }),
    { page: 10_000, status: "failed", source: "aba", query: "aba" },
  );
  assert.deepEqual(
    normalizeAlertHistoryFilters({ page: "-4", status: "drop table", source: "unknown", q: "x".repeat(80) }),
    { page: 1, status: "all", source: "all", query: "x".repeat(50) },
  );
});

test("history display labels allowlist payment sources and statuses", () => {
  assert.equal(alertHistorySourceLabel("aba_payway"), "ABA PayWay");
  assert.equal(alertHistorySourceLabel("bakong"), "Bakong");
  assert.equal(alertHistorySourceLabel("sensitive-source"), "Other");
  assert.equal(alertHistoryStatusLabel("review_required"), "Needs review");
  assert.equal(alertHistoryStatusLabel("secret-status"), "Unknown");
  assert.equal(alertHistoryStatusClass("secret-status"), "status_unknown");
});
