import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsPeriodStart,
  analyticsProviderLabel,
  normalizeAnalyticsPeriod,
  summarizeAnalyticsPayments,
} from "../src/lib/dashboard/analytics.ts";

test("analytics periods are restricted to supported ranges", () => {
  assert.equal(normalizeAnalyticsPeriod("7"), 7);
  assert.equal(normalizeAnalyticsPeriod("90"), 90);
  assert.equal(normalizeAnalyticsPeriod("999"), 30);
});

test("analytics starts at UTC midnight and includes the requested calendar days", () => {
  assert.equal(analyticsPeriodStart(7, new Date("2026-10-18T12:30:00Z")).toISOString(), "2026-10-12T00:00:00.000Z");
});

test("payment summaries preserve currencies and allowlist provider labels", () => {
  const summary = summarizeAnalyticsPayments([
    { amount: 5, currency: "USD", provider: "aba_payway", created_at: "2026-10-18T08:00:00Z" },
    { amount: 10_000, currency: "KHR", provider: "bakong", created_at: "2026-10-18T09:00:00Z" },
    { amount: 2, currency: "USD", provider: "private-provider", created_at: "invalid" },
  ]);
  assert.equal(summary.usd, 7);
  assert.equal(summary.khr, 10_000);
  assert.equal(summary.dailyCounts.get("2026-10-18"), 2);
  assert.equal(analyticsProviderLabel("ABA_PAYWAY"), "ABA PayWay");
  assert.equal(analyticsProviderLabel("private-provider"), "Other");
});
