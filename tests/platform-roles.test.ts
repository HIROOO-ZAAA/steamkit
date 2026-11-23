import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getHighestRole, hasRole } from "../src/lib/auth/platformRoles.ts";

const guard = readFileSync("src/lib/auth/requirePlatformRole.ts", "utf8");
const originalMigration = readFileSync(
  "supabase/migrations/20261111000004_platform_roles.sql",
  "utf8",
);
const correctiveMigration = readFileSync(
  "supabase/migrations/20261119000001_fix_platform_role_hierarchy.sql",
  "utf8",
);

test("platform role hierarchy treats super_admin as highest", () => {
  assert.equal(hasRole("viewer", "super_admin"), false);
  assert.equal(hasRole("viewer", "creator_admin"), false);
  assert.equal(hasRole("creator_admin", "platform_admin"), false);
  assert.equal(hasRole("creator_admin", "creator_admin"), true);
  assert.equal(hasRole("super_admin", "viewer"), true);
  assert.equal(hasRole(null, "viewer"), false);
  assert.equal(getHighestRole(["viewer", "super_admin"]), "super_admin");
  assert.equal(getHighestRole([]), "viewer");
});

test("platform role guard computes active roles from the role table", () => {
  assert.match(guard, /from\("platform_roles"\)/);
  assert.match(guard, /\.select\("role, expires_at"\)/);
  assert.match(guard, /getHighestRole\(activeRoles\)/);
  assert.match(guard, /hasRole\(userPlatformRole, minRole\)/);
  assert.doesNotMatch(guard, /streamkit_get_platform_role/);
});

test("platform role SQL ranks roles explicitly instead of using enum order", () => {
  for (const migration of [originalMigration, correctiveMigration]) {
    assert.match(migration, /streamkit_platform_role_rank/);
    assert.match(
      migration,
      /(?:public\.)?streamkit_platform_role_rank\(pr\.role\)\s*>=\s*(?:public\.)?streamkit_platform_role_rank\(p_min_role\)/i,
    );
    assert.match(
      migration,
      /order by (?:public\.)?streamkit_platform_role_rank\(pr\.role\) desc/i,
    );
    assert.doesNotMatch(migration, /role\s*>=\s*p_min_role/i);
    assert.doesNotMatch(migration, /order by role desc/i);
  }
});
