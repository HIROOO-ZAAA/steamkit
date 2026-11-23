import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { dashboardNavigation } from "../src/config/navigation.ts";

const navigationItems = dashboardNavigation.sections.flatMap(
  (section) => section.items,
);

test("hidden routes stay out of the dashboard navigation", () => {
  const hiddenRoutes = [
    "/dashboard/browser-source",
    "/dashboard/browser-source",
    "/dashboard/widget-overlays",
    "/dashboard/obs-remote",
    "/dashboard/projects",
    "/dashboard/settings/login-history",
  ];

  const visibleRoutes = new Set(
    navigationItems.flatMap((item) => (item.href ? [item.href] : [])),
  );

  for (const route of hiddenRoutes) {
    assert.equal(visibleRoutes.has(route), false, `${route} must stay hidden`);
  }
});

test("navigation contains only actionable destinations", () => {
  for (const section of dashboardNavigation.sections) {
    assert.ok(section.items.length > 0, `${section.label} must not be empty`);
    assert.ok(
      section.items.every((item) => Boolean(item.href)),
      `${section.label} must not contain placeholder entries`,
    );
  }
});

test("mobile navigation controls have comfortable touch targets", () => {
  const styles = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "DashboardNav.module.css"),
    "utf8",
  );
  const themeStyles = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "ThemeToggle.module.css"),
    "utf8",
  );

  assert.match(
    styles,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.navLink\s*\{[^}]*min-height:\s*44px;/,
  );
  assert.match(
    styles,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.mobileToggleBtn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/,
  );
  assert.match(
    styles,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.signOutBtn\s*\{[^}]*min-height:\s*44px;/,
  );
  assert.match(
    themeStyles,
    /\.compact\s*\{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/,
  );
});

test("core creator workflows remain in the dashboard navigation", () => {
  const visibleRoutes = new Set(
    navigationItems.flatMap((item) => (item.href ? [item.href] : [])),
  );

  for (const route of [
    "/dashboard",
    "/dashboard/payments/donations",
    "/dashboard/widgets/alerts",
    "/dashboard/alert-history",
    "/dashboard/settings/voice-settings",
    "/dashboard/integrations/kit-client",
    "/dashboard/settings",
  ]) {
    assert.equal(visibleRoutes.has(route), true, `${route} must remain visible`);
  }
});

test("every visible navigation destination has an app page", () => {
  for (const item of navigationItems) {
    const pathname = new URL(item.href, "http://streamkit.local").pathname;
    const pageFile = join(
      process.cwd(),
      "src",
      "app",
      ...pathname.split("/").filter(Boolean),
      "page.tsx",
    );

    assert.ok(existsSync(pageFile), `${item.label} points to missing page ${pathname}`);
  }
});

test("mobile navigation returns focus to its toggle when a route is selected", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "DashboardNav.tsx"),
    "utf8",
  );

  assert.match(source, /function handleNavItemClick\(\)\s*\{\s*if \(mobileOpen\) closeMobileDrawer\(\);\s*\}/);
  assert.match(source, /onClick=\{handleNavItemClick\}/);
  assert.match(source, /function closeMobileDrawer\(\)\s*\{\s*setMobileOpen\(false\);\s*mobileToggleRef\.current\?\.focus\(\);\s*\}/);
});
