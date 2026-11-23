import assert from "node:assert/strict";
import test from "node:test";
import {
  getLeaderboardSettings,
  getLeaderboardWidgets,
} from "../src/lib/dashboard/leaderboard-settings-adapter.ts";
import { getWidgetSettingsState } from "../src/lib/dashboard/widget-settings-state.ts";

test("saved widget loading state distinguishes loading, errors, empty, and ready", () => {
  assert.equal(getWidgetSettingsState({ loading: true, failed: false, widgetCount: 0 }), "loading");
  assert.equal(getWidgetSettingsState({ loading: false, failed: true, widgetCount: 0 }), "error");
  assert.equal(getWidgetSettingsState({ loading: false, failed: false, widgetCount: 0 }), "empty");
  assert.equal(getWidgetSettingsState({ loading: false, failed: false, widgetCount: 2 }), "ready");
});

test("leaderboard settings adapter prefers the legacy single-widget record", () => {
  const settings = getLeaderboardSettings({
    leaderboard_widget: { title: "Legacy", rows: 5 },
    widget_settings: { widgets: [{ settings: { title: "Current" } }] },
  });

  assert.deepEqual(settings, { title: "Legacy", rows: 5 });
});

test("leaderboard settings adapter falls back to the first saved widget", () => {
  const settings = getLeaderboardSettings({
    widget_settings: { widgets: [{ settings: { title: "Current", rows: 7 } }] },
  });

  assert.deepEqual(settings, { title: "Current", rows: 7 });
});

test("leaderboard widget adapter converts legacy settings without writing them", () => {
  const widgets = getLeaderboardWidgets({
    leaderboard_widget: {
      title: "Top Supporters",
      rows: 3,
      entryAnimation: "Drop Down",
      colors: { background: "#0F172A", amount: "#10B981" },
    },
  });

  assert.deepEqual(widgets, [{
    id: 1,
    title: "Top Supporters",
    rows: 3,
    animation: "dropdown",
    type: "ALL-TIME",
    colors: ["#0F172A", "#1E3350", "#10B981", "#F8FAFC", "#F8FAFC", "#10B981"],
    settings: {
      title: "Top Supporters",
      rows: 3,
      entryAnimation: "Drop Down",
      colors: { background: "#0F172A", amount: "#10B981" },
    },
  }]);
});
