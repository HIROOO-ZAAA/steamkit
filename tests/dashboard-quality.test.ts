import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { adminNavigation, type AdminNavItem } from "../src/config/adminNavigation.ts";
import {
  parseSavedObsConnection,
  serializeObsConnection,
} from "../src/lib/obs-connection-storage.ts";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function adminItems(): AdminNavItem[] {
  return adminNavigation.sections.flatMap(
    (section) => section.items as AdminNavItem[],
  );
}

test("dashboard copy is free of mojibake", () => {
  for (const file of [
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/widgets/goals/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /Â·|â€”|áŸ›|Ã|â€/);
  }
});

test("admin navigation only links to existing admin pages", () => {
  const items = adminItems();
  assert.ok(items.length > 0);

  for (const item of items) {
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

test("unfinished admin pages stay out of the navigation", () => {
  const visibleRoutes = new Set(adminItems().map((item) => item.href));

  for (const route of [
    "/admin/health",
    "/admin/users",
    "/admin/payment-config",
    "/admin/donation-photos",
    "/admin/config",
    "/admin/integrations",
    "/admin/audit",
  ]) {
    assert.equal(visibleRoutes.has(route), false, `${route} must stay hidden`);
  }
});

test("admin billing keeps server data access out of client UI", () => {
  const page = read("src/app/admin/billing/page.tsx");
  const client = read("src/app/admin/billing/BillingTiersClient.tsx");

  assert.match(page, /<BillingTiersClient/);
  assert.doesNotMatch(page, /onClick=/);
  assert.doesNotMatch(page, /@\/lib\/supabase\/server/);
  assert.match(client, /^"use client"/);
  assert.match(client, /onSubmit=\{\(event\) => void createTier\(event\)\}/);
  assert.match(client, /onSubmit=\{\(event\) => void updateTier\(event\)\}/);
  assert.match(client, /tierId: String\(form\.get\("tierId"\)\s*\?\?\s*""\)/);
  assert.match(client, /userId: String\(form\.get\("userId"\)\s*\?\?\s*""\)/);
});

test("creator subscription forms post JSON through client handlers", () => {
  const pages = [
    "src/app/dashboard/payments/subscriptions/page.tsx",
    "src/app/dashboard/payments/subscriptions/new/page.tsx",
    "src/app/dashboard/payments/subscriptions/[id]/edit/page.tsx",
  ]
    .map(read)
    .join("\n");
  const client = read("src/app/dashboard/payments/subscriptions/TierFormsClient.tsx");

  assert.doesNotMatch(pages, /method="(?:post|patch|delete)"/);
  assert.match(pages, /<CreateTierForm \/>/);
  assert.match(pages, /<EditTierForm/);
  assert.match(client, /^"use client"/);
  assert.match(client, /method: "POST"/);
  assert.match(client, /method: "PATCH"/);
  assert.match(client, /method: "DELETE"/);
  assert.match(client, /"Content-Type": "application\/json"/);
  assert.equal(client.match(/router\.refresh\(\);\s*router\.push/g)?.length, 3);
});

test("creator billing tier mutations stay scoped to the authenticated owner", () => {
  const source = read("src/app/api/creator/billing/tiers/[id]/route.ts");
  const patch = source.slice(
    source.indexOf("export async function PATCH"),
    source.indexOf("export async function DELETE"),
  );
  const remove = source.slice(source.indexOf("export async function DELETE"));

  assert.match(patch, /\.update\(updates\)/);
  assert.match(patch, /\.eq\("id", tierId\)/);
  assert.match(patch, /\.eq\("user_id", user\.id\)/);
  assert.match(remove, /\.delete\(\)/);
  assert.equal(remove.match(/\.eq\("user_id", user\.id\)/g)?.length, 2);
});

test("Telegram 2FA reports bridge verification failures", () => {
  const page = read("src/app/dashboard/integrations/kit-client/page.tsx");
  const bridge = read("scripts/kit-client-bridge.mjs");

  assert.match(page, /if \(!response\.ok \|\| !result\.ok\)/);
  assert.match(page, /throw new Error\(result\.error \|\| "Two-step verification failed\."\)/);
  assert.match(bridge, /settlePending2fa\(\{ ok: false, error: msg \}\)/);
  assert.match(bridge, /const result = await pending\.verified/);
  assert.match(bridge, /Two-step verification is not pending\./);
});

test("Telegram 2FA password is cleared when the session resets", () => {
  const source = read("src/app/dashboard/integrations/kit-client/page.tsx");
  const logout = source.slice(source.indexOf("async function logout"), source.indexOf("const selectedGroup"));

  assert.match(logout, /setPassword\(""\)/);
  assert.match(source, /data\.status === "qr"\) \{\s*setPassword\(""\)/);
  assert.match(source, /stored by the local bridge on this machine, not in your browser/);
  assert.doesNotMatch(source, /securely stored in your browser/);
  assert.doesNotMatch(source, /We do not have access to or control over this data/);
});

test("settings password UI does not claim current-password verification", () => {
  const source = read("src/app/dashboard/settings/page.tsx");

  assert.doesNotMatch(source, /settings-current-password/);
  assert.doesNotMatch(source, /Current Password/);
  assert.doesNotMatch(source, /currentPassword/);
  assert.match(source, /Changing your password here does not ask for the current one/);
  assert.match(source, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.match(source, /newPassword\.length < 8/);
  assert.match(source, /newPassword !== confirmPassword/);
});

test("leaderboard toast distinguishes failed actions", () => {
  const source = read("src/app/dashboard/widgets/leaderboard/page.tsx");

  assert.match(source, /const \[toastError, setToastError\]/);
  assert.match(source, /const showToast = \(message: string, isError = false\)/);
  assert.match(source, /role=\{toastError \? "alert" : "status"\}/);
  assert.match(source, /showToast\(`Save failed: \$\{e instanceof Error \? e\.message : String\(e\)\}`, true\)/);
  assert.doesNotMatch(source, /Widget saved\. OBS overlay updated\./);
  assert.match(source, /Leaderboard settings saved\. The overlay checks for changes every 2 seconds\./);
  assert.match(source, /Leaderboard widget cleared\./);
  assert.equal(source.match(/\.select\("creator_id"\)\s*\.maybeSingle\(\)/g)?.length, 2);
  assert.match(source, /TEST donation recorded\. Check your active OBS sources/);
  assert.doesNotMatch(source, /Test donation sent to OBS/);
  assert.match(source, /records one TEST donation in your account/);
  assert.doesNotMatch(source, /mock layout will appear on your OBS widget for 1 minute/);
});

test("alert page reports failed actions accurately", () => {
  const source = read("src/app/dashboard/widgets/alerts/page.tsx");

  assert.match(source, /toastTone/);
  assert.match(source, /showToast\(`Test failed: \$\{payload\.error \|\| response\.statusText\}`, "error"\)/);
  assert.match(source, /showToast\("Could not send the test alert[^\n]*"error"\)/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /const savedRow = id \? tierRows\[id\] \?\? null : tierRows\.base \?\? null;/);
  assert.match(source, /Custom banned-word lists are not available yet/);
});

test("alert page reports clipboard failures instead of false success", () => {
  const source = read("src/app/dashboard/widgets/alerts/page.tsx");
  const copyUrl = source.slice(source.indexOf("const handleCopyUrl"), source.indexOf("const handleAddBannedWord"));
  const copyImage = source.slice(source.indexOf("const handleCopyImageUrl"), source.indexOf("const handleCopySoundUrl"));
  const copySound = source.slice(source.indexOf("const handleCopySoundUrl"), source.indexOf("const playAlertSound"));

  for (const handler of [copyUrl, copyImage, copySound]) {
    assert.match(handler, /await navigator\.clipboard\.writeText/);
    assert.match(handler, /showToast\([^\n]*"error"\)/);
  }
  assert.match(source, /onClick=\{\(\) => void handleCopyUrl\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void handleCopyImageUrl\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void handleCopySoundUrl\(\)\}/);
});

test("alert test success does not claim OBS delivery", () => {
  const source = read("src/app/dashboard/widgets/alerts/page.tsx");

  assert.doesNotMatch(source, /test alert sent to OBS/);
  assert.match(source, /TEST alert recorded\. Check your active OBS sources/);
});

test("tips verification debounce only clears the active currency timer", () => {
  const source = read("src/app/dashboard/payments/tips/page.tsx");
  const start = source.indexOf("function handleAbaInput");
  const end = source.indexOf("async function handleSave");
  assert.ok(start >= 0 && end > start, "tips input handler must exist");
  const handler = source.slice(start, end);

  assert.match(handler, /const timerRef = key === "usd" \? usdTimerRef : khrTimerRef;/);
  assert.doesNotMatch(handler, /if \(usdTimerRef\.current !== null\)/);
  assert.doesNotMatch(handler, /if \(khrTimerRef\.current !== null\)/);
});

test("dashboard segment has an error boundary with retry", () => {
  const source = read("src/app/dashboard/error.tsx");

  assert.match(source, /^"use client"/);
  assert.match(source, /reset: \(\) => void/);
  assert.match(source, /onClick=\{reset\}/);
  assert.match(source, /role="alert"/);
});

test("fan-points integration test is opt-in and test-scoped", () => {
  const source = read("tests/fan-points.test.ts");

  assert.match(source, /RUN_FAN_POINTS_INTEGRATION/);
  assert.match(source, /from "node:test"/);
  assert.doesNotMatch(source, /delete\(\)\.neq\(/);
  assert.doesNotMatch(source, /process\.exit\(/);
});

test("OBS connection storage keeps only the host", () => {
  assert.deepEqual(
    parseSavedObsConnection('{"host":"ws://127.0.0.1:4455","password":"secret"}'),
    { host: "ws://127.0.0.1:4455" },
  );
  assert.equal(
    serializeObsConnection("ws://127.0.0.1:4455"),
    '{"host":"ws://127.0.0.1:4455"}',
  );

  const source = read("src/app/dashboard/integrations/obs/page.tsx");
  assert.doesNotMatch(source, /JSON\.stringify\(\{ host, password \}\)/);
  assert.match(source, /never saved in this browser/);
});
