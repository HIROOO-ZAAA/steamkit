import assert from "node:assert/strict";
import test from "node:test";
import { validateWidgetSettings } from "../src/lib/overlay/widget-validation.ts";

const valid = {
  title: "Top Donors",
  rows: 5,
  rowGap: 4,
  maxName: 30,
  fontSize: 20,
  strokeW: 0,
  colors: { background: "#0F172A", amount: "#10B981" },
};

test("widget settings accept valid layout bounds and colors", () => {
  assert.equal(validateWidgetSettings(valid), null);
});

test("widget settings reject invalid layout bounds and colors", () => {
  assert.match(validateWidgetSettings({ ...valid, rows: 0 }) ?? "", /Rows/);
  assert.match(validateWidgetSettings({ ...valid, fontSize: 200 }) ?? "", /Font size/);
  assert.match(validateWidgetSettings({ ...valid, colors: { ...valid.colors, amount: "red" } }) ?? "", /color/);
});
