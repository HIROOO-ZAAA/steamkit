import assert from "node:assert/strict";
import test from "node:test";
import { validateAlertTemplate } from "../src/lib/overlay/alert-logic.ts";

test("accepts documented placeholders and numbered spacing tokens", () => {
  assert.deepEqual(validateAlertTemplate("{name} gave {amount} {currency}: {message} {space:10} {avatar}"), {
    errors: [],
    warnings: [],
  });
});

test("reports missing speech placeholders as warnings without blocking custom text", () => {
  assert.deepEqual(validateAlertTemplate("Thanks for supporting the stream!"), {
    errors: [],
    warnings: ["Template does not include {name}.", "Template does not include {amount}.", "Template does not include {message}."],
  });
});

test("rejects unsupported, malformed, empty, and oversized templates", () => {
  const unsupported = validateAlertTemplate("Hello {first_name}");
  assert.match(unsupported.errors.join(" "), /Unsupported placeholder/);

  const malformed = validateAlertTemplate("Hello {name");
  assert.match(malformed.errors.join(" "), /unmatched brace/);

  assert.match(validateAlertTemplate("  ").errors.join(" "), /cannot be empty/);
  assert.match(validateAlertTemplate("x".repeat(1001)).errors.join(" "), /1,000 characters/);
});
