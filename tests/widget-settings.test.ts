import assert from "node:assert/strict";
import test from "node:test";
import { selectWidgetSettings } from "../src/lib/overlay/widget-settings.ts";
import { widgetOverlayUrl } from "../src/lib/overlay/widget-url.ts";

test("legacy widget URLs keep using the saved root configuration", () => {
  const settings = { title: "Legacy", rows: 5 };
  assert.equal(selectWidgetSettings(settings)?.title, "Legacy");
});

test("per-widget URLs select only their matching saved settings", () => {
  const settings = {
    title: "Legacy root",
    widgets: [
      { id: 101, settings: { title: "First", rows: 2 } },
      { id: "widget-b", settings: { title: "Second", rows: 4 } },
    ],
  };
  assert.deepEqual(selectWidgetSettings(settings, "101"), { title: "First", rows: 2 });
  assert.deepEqual(selectWidgetSettings(settings, "widget-b"), { title: "Second", rows: 4 });
  assert.equal(selectWidgetSettings(settings, "missing"), null);
});

test("per-widget URLs preserve the token and path and reject unrelated URLs", () => {
  const url = widgetOverlayUrl("https://streamkit.example/overlay/widget?token=private", "w-1");
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/overlay/widget");
  assert.equal(parsed.searchParams.get("token"), "private");
  assert.equal(parsed.searchParams.get("widget"), "w-1");
  assert.equal(widgetOverlayUrl("https://streamkit.example/overlay/alerts?token=private", "w-1"), null);
});
