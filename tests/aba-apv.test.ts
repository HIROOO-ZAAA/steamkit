import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAbaProviderTransactionId } from "../src/lib/payments/aba-apv.ts";

test("rejects null and undefined ABA APVs", () => {
  assert.equal(normalizeAbaProviderTransactionId(null), null);
  assert.equal(normalizeAbaProviderTransactionId(undefined), null);
});

test("rejects empty and whitespace-only ABA APVs", () => {
  assert.equal(normalizeAbaProviderTransactionId(""), null);
  assert.equal(normalizeAbaProviderTransactionId("   "), null);
  assert.equal(normalizeAbaProviderTransactionId("\t\n"), null);
});

test("keeps and trims valid ABA APVs", () => {
  assert.equal(normalizeAbaProviderTransactionId("APV-123"), "APV-123");
  assert.equal(normalizeAbaProviderTransactionId("  APV-456  "), "APV-456");
});
