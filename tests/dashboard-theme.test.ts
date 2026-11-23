import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  DASHBOARD_THEME_BOOTSTRAP,
  DASHBOARD_THEME_KEY,
  resolveDashboardTheme,
} from "../src/lib/dashboard-theme.ts";

function runThemeBootstrap({
  storedTheme,
  prefersLight,
  readFails = false,
}: {
  storedTheme: string | null;
  prefersLight: boolean;
  readFails?: boolean;
}) {
  let appliedTheme: string | null = null;
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, DASHBOARD_THEME_KEY);
      if (readFails) throw new Error("storage unavailable");
      return storedTheme;
    },
  };

  runInNewContext(DASHBOARD_THEME_BOOTSTRAP, {
    localStorage,
    window: { matchMedia: () => ({ matches: prefersLight }) },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          assert.equal(name, "data-dashboard-theme");
          appliedTheme = value;
        },
      },
    },
  });

  return appliedTheme;
}

test("dashboard theme bootstrap restores a saved theme before paint", () => {
  assert.equal(
    runThemeBootstrap({ storedTheme: "light", prefersLight: false }),
    "light",
  );
  assert.equal(
    runThemeBootstrap({ storedTheme: "dark", prefersLight: true }),
    "dark",
  );
});

test("dashboard theme bootstrap uses system preference for an unknown saved value", () => {
  assert.equal(
    runThemeBootstrap({ storedTheme: "unexpected", prefersLight: true }),
    "light",
  );
  assert.equal(
    runThemeBootstrap({ storedTheme: null, prefersLight: false }),
    "dark",
  );
});

test("dashboard theme bootstrap safely defaults to dark when storage is unavailable", () => {
  assert.equal(
    runThemeBootstrap({ storedTheme: null, prefersLight: true, readFails: true }),
    "dark",
  );
});

test("theme changes from another tab follow the stored value or system preference", () => {
  assert.equal(resolveDashboardTheme("light", false), "light");
  assert.equal(resolveDashboardTheme("dark", true), "dark");
  assert.equal(resolveDashboardTheme(null, true), "light");
  assert.equal(resolveDashboardTheme("invalid", false), "dark");
});
