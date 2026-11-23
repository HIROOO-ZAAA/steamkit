import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { join, resolve } from "node:path";
import { guides } from "../src/app/setup-guides/guides.ts";

function collectAppRoutes(directory = resolve("src/app"), segments: string[] = []): string[][] {
  const routes: string[][] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") {
      routes.push(segments.filter((segment) => !segment.startsWith("(") && !segment.startsWith("@")));
    } else if (entry.isDirectory()) {
      routes.push(...collectAppRoutes(join(directory, entry.name), [...segments, entry.name]));
    }
  }

  return routes;
}

function routePatternMatches(pattern: string[], requested: string[]) {
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index]!;
    if (segment.startsWith("[[...") && segment.endsWith("]]")) return true;
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      return requested.length > index;
    }
    if (index >= requested.length) return false;
    if (segment.startsWith("[") && segment.endsWith("]")) continue;
    if (segment !== requested[index]) return false;
  }

  return pattern.length === requested.length;
}

test("guide copy explains that alert and widget tests create marked test history", () => {
  for (const slug of ["add-obs-overlay", "voice-alerts", "goals-leaderboards"]) {
    const guide = guides.find((item) => item.slug === slug);
    assert.ok(guide, `${slug} guide should exist`);

    const copy = guide.steps
      .flatMap((step) => [
        ...step.body,
        ...(step.points ?? []),
        ...(step.warning ? [step.warning.text] : []),
      ])
      .join(" ");

    assert.match(copy, /stores a donation-history entry marked TEST/i, `${slug} should disclose test-history storage`);
    assert.match(copy, /does not create a real payment/i, `${slug} should distinguish tests from real payments`);
    assert.doesNotMatch(copy, /does not .*change donation history/i, `${slug} must not claim test entries are absent from history`);
  }
});

test("related guides and internal guide links resolve to existing guide slugs", () => {
  const slugs = new Set(guides.map((guide) => guide.slug));

  for (const guide of guides) {
    for (const relatedSlug of guide.related) {
      assert.ok(
        slugs.has(relatedSlug),
        `${guide.slug} references missing related guide ${relatedSlug}`,
      );
    }

    for (const step of guide.steps) {
      for (const link of step.links ?? []) {
        const url = new URL(link.href, "http://streamkit.local");
        if (url.pathname !== "/setup-guides") continue;

        const linkedSlug = url.searchParams.get("guide");
        if (!linkedSlug) continue;

        assert.ok(
          slugs.has(linkedSlug),
          `${guide.slug} links to missing guide ${linkedSlug}`,
        );
      }
    }
  }
});

test("every internal setup-guide action points to an existing app page", () => {
  const routes = collectAppRoutes();

  for (const guide of guides) {
    for (const step of guide.steps) {
      for (const link of step.links ?? []) {
        const url = new URL(link.href, "http://streamkit.local");
        if (url.origin !== "http://streamkit.local") continue;

        const requested = url.pathname.split("/").filter(Boolean);
        assert.ok(
          routes.some((route) => routePatternMatches(route, requested)),
          `${guide.slug} link '${link.label}' points to missing app page ${url.pathname}`,
        );
      }
    }
  }
});
