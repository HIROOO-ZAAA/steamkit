# StreamKit — Staging-Only Security Verification Plan
**Task:** Controlled staging experiment for `profiles.role` privilege-escalation concern  
**Repository:** `D:\pong steam\streamkit`  
**Date:** 2026-11-07  
**Mode:** READ-ONLY PLANNING — NO EXECUTION, NO DATABASE CONNECTIONS, NO CHANGES

---

## 1. Executive Summary

This plan prepares a **controlled staging experiment** to verify whether the canonical migration (`20261030000001_profiles_role_privilege_canonical.sql`) fully prevents authenticated users from escalating `profiles.role` to `'admin'`, accounting for:

- PostgreSQL's `set_config('role', ...)` vs `SET ROLE` semantics
- PostgREST's `authenticator` role architecture
- The trigger's independent trust branch: `v_effective_role = 'service_role'`
- Any execution path allowing role manipulation

**Verdict to be determined by staging experiment:**
- `READY FOR STAGING TEST APPROVAL` — all preconditions met, experiment can proceed
- `NOT READY — DESIGN ISSUE FOUND` — migration or trigger logic has a flaw
- `INCONCLUSIVE — MORE INVESTIGATION REQUIRED` — insufficient evidence even after staging

---

## 2. PostgreSQL Role-Setting Behavior — Authoritative Evidence

### 2.1 `SET ROLE` vs `set_config('role', ...)` — Verified PostgreSQL Semantics

| Operation | Membership Check | Changes | Requires |
|-----------|------------------|---------|----------|
| `SET ROLE rolename` | **YES** — current effective role must be member of `rolename` | `current_user`, `current_setting('role')`, adds to role stack | Membership in target role |
| `set_config('role', 'rolename', true)` | **NO** — any role can call | **Only** `current_setting('role')` (session-local GUC) | No membership required |
| `RESET ROLE` | No | Pops role stack, restores previous `current_user` | — |

**Source:** PostgreSQL source code (`src/backend/utils/misc/guc.c`, `src/backend/commands/user.c`), documented behavior since 9.0.

### 2.2 `check_role()` and `member_can_set_role()` Implementation

```c
// Simplified from PostgreSQL source (src/backend/commands/user.c)
bool member_can_set_role(Oid member, Oid role) {
    // Called by SET ROLE and RESET ROLE
    // Returns true if 'member' is a member of 'role' (direct or indirect)
    // Admin option NOT required for SET ROLE
    return is_member_of_role(member, role);
}

// set_config('role', ...) does NOT call member_can_set_role()
// It only validates the value is a valid role name, then sets the GUC
```

**Critical distinction:** `set_config('role', 'service_role', true)` **bypasses all membership checks**. It only changes the GUC `role` setting visible to `current_setting('role', true)`.

### 2.3 Session Variables in PostgREST Context

| Variable | PostgREST Request (anon JWT) | PostgREST Request (user JWT) | PostgREST Request (service key) | Direct `psql` as `postgres` |
|----------|------------------------------|------------------------------|----------------------------------|----------------------------|
| `session_user` | `authenticator` | `authenticator` | `authenticator` | `postgres` |
| `current_user` (initial) | `authenticator` | `authenticator` | `authenticator` | `postgres` |
| `current_user` (after `SET ROLE`) | `anon` | `authenticated` | `service_role` | (unchanged unless `SET ROLE`) |
| `current_setting('role', true)` | `'anon'` | `'authenticated'` | `'service_role'` | `'none'` (or last `SET ROLE`) |

### 2.4 Can Authenticated User Call `set_config('role', 'service_role', true)`?

**Directly via SQL:** No — no RPC exposes this.  
**Indirectly via exposed function:** **Must verify** — scan all `SECURITY DEFINER` functions granted to `authenticated`/`anon` for `set_config` calls with `'role'` parameter.

### 2.5 PostgreSQL Version Differences

| Version | `set_config('role', ...)` Behavior | `SET ROLE` Membership Check |
|---------|-------------------------------------|----------------------------|
| 13–17 | GUC-only, no membership check | Unchanged: requires membership |
| Supabase (managed) | Same as upstream | Same |

**No version-dependent behavior difference** for the operations in scope.

---

## 3. PostgREST Execution-Path Analysis

### 3.1 All RPC Functions Callable by `anon` or `authenticated` (from `supabase_schema.sql` + migrations)

| Function | Grants | `SECURITY` | Dynamic SQL? | Calls `set_config('role', ...)`? | Calls `SET ROLE`? | Risk |
|----------|--------|------------|--------------|----------------------------------|-------------------|------|
| `streamkit_resolve_overlay(text)` | `anon, authenticated, service_role` | DEFINER | No | No | No | None (read-only) |
| `streamkit_get_public_creator_supporters(text, int)` | `anon, authenticated` | DEFINER | No | No | No | None (read-only) |
| `streamkit_recent_spin_tips(text, timestamptz)` | `anon, authenticated` | DEFINER | No | No | No | None (read-only) |
| `streamkit_allow_payment_request(text, int, int)` | `service_role` only | DEFINER | No | No | No | Not callable by authenticated |
| `streamkit_complete_bakong_payment(...)` | `service_role` only | DEFINER | No | No | No | Not callable by authenticated |
| `streamkit_complete_aba_payment(...)` | `service_role` only | DEFINER | No | No | No | Not callable by authenticated |
| `streamkit_create_telegram_group_link(...)` | `authenticated` | DEFINER | No | No | No | Profile upsert only (safe cols) |
| `streamkit_spin_wheel(text)` | `authenticated` | DEFINER | No | No | No | Read-only |
| `streamkit_draw_raffle_winner(uuid)` | `authenticated` | DEFINER | No | No | No | Read/write but owner-scoped |
| `streamkit_get_widget_overlay_settings(...)` | `authenticated` | DEFINER | No | No | No | Read-only |
| `streamkit_get_widget_leaderboard(text)` | `authenticated` | DEFINER | No | No | No | Read-only |

### 3.2 Direct Table Access via PostgREST

| Table | `anon` Grants | `authenticated` Grants | RLS Policies |
|-------|---------------|------------------------|--------------|
| `profiles` | `SELECT` | `SELECT`, column `INSERT`/`UPDATE` (safe cols only) | `INSERT`/`UPDATE` on own row only |
| `tips` | None | `SELECT` | Owner-scoped |
| `alert_settings` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `voice_settings` | None | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `voice_clones` | None | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `donation_goals` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `spin_wheels` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `raffles` | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `raffle_entries` | `INSERT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Owner-scoped |
| `payment_transactions` | None | None | — (service_role only) |

### 3.3 Application Write Paths to `profiles` (Read-Only Verified)

| Path | File | Columns Written | Uses `role`? |
|------|------|-----------------|--------------|
| Dashboard Settings Save | `src/app/dashboard/settings/page.tsx:310-321` | `id`, `display_name`, `username`, `avatar_url`, `banner_url` | **No** |
| Telegram Group Create | `src/app/api/telegram/groups/create/route.ts:33-38` | `id` only (upsert with no other fields) | **No** |

**No application path writes `role` or `created_at`.**

### 3.4 PostgREST `SET ROLE` Behavior

- PostgREST **controls** `SET ROLE` per request based on the presented credential (anon key, user JWT, service key)
- User **cannot** influence which role PostgREST selects
- User **cannot** execute arbitrary SQL between requests
- Each HTTP request = new transaction (or pooled connection with `SET ROLE` reset)

---

## 4. Staging Prerequisites

### 4.1 Required Staging Environment

| Item | Specification |
|------|---------------|
| **Project** | Disposable Supabase project (separate from production) |
| **Database** | Fresh or isolated test schema; **must not** share with production |
| **Migrations** | Apply `supabase_schema.sql` + all `supabase/migrations/*.sql` in filename order, **ending with** `20261030000001_profiles_role_privilege_canonical.sql` |
| **PostgREST** | Same version as production (Supabase managed) |
| **Auth** | Supabase Auth enabled (email + Google OAuth) |

### 4.2 Required Test Users

| User | Role | Purpose |
|------|------|---------|
| `test_admin` | `authenticated` + service key access | Service-role positive tests |
| `test_user_a` | `authenticated` | Primary attack vector (existing profile) |
| `test_user_b` | `authenticated` | New user (no profile) |
| `test_user_c` | `authenticated` | Cross-user test target |
| `anon` | Built-in | Anonymous access tests |

### 4.3 Required Credentials (Placeholders Only — **Never Real Secrets**)

```
STAGING_PROJECT_REF=abcdefghijklmnop
STAGING_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
STAGING_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLACEHOLDER
STAGING_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLACEHOLDER
STAGING_DB_URL=postgresql://postgres:PLACEHOLDER@db.abcdefghijklmnop.supabase.co:5432/postgres
```

### 4.4 Approval Variables (Required Before Any Experiment)

```bash
CONFIRM_STAGING=yes
STAGING_PROJECT_REF=abcdefghijklmnop
CONFIRM_STAGING_PROJECT_REF=abcdefghijklmnop
ALLOW_REMOTE_STAGING=yes
```

---

## 5. Detailed Test Matrix

### 5.1 A. Role Membership Verification

| Test ID | SQL/Action | Expected Result | Classification |
|---------|------------|-----------------|----------------|
| A.1 | `SELECT pg_has_role('authenticator', 'service_role', 'member');` | `true` (required for PostgREST) | VERIFY IN STAGING |
| A.2 | Recursive `pg_auth_members` walk from `authenticator` | List all reachable roles | VERIFY IN STAGING |
| A.3 | `SELECT pg_has_role('authenticated', 'service_role', 'member');` | `false` | VERIFY IN STAGING |
| A.4 | `SELECT pg_has_role('anon', 'service_role', 'member');` | `false` | VERIFY IN STAGING |
| A.5 | `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','postgres','supabase_admin');` | `authenticated`/`anon`: no super, no bypass; `service_role`: bypassrls, no super | VERIFY IN STAGING |
| A.6 | Check owner of `public.profiles`, `public` schema, database, trigger function | Not `authenticated`/`anon` | VERIFY IN STAGING |

### 5.2 B. Role-Setting Behavior Tests

| Test ID | SQL/Action | Expected Outcome | Explanation |
|---------|------------|------------------|-------------|
| B.1 | As `authenticated`: `SET ROLE service_role;` | **FAIL** — `ERROR: must be member of role "service_role"` | Membership required |
| B.2 | As `authenticated`: `SELECT set_config('role', 'service_role', true);` | **SUCCEEDS** — returns `'service_role'` | GUC-only, no membership check |
| B.3 | After B.2: `SELECT current_setting('role', true), session_user, current_user;` | `role='service_role'`, `session_user='authenticator'`, `current_user='authenticated'` | Only GUC changes |
| B.4 | As `authenticated`: `BEGIN; SELECT set_config('role', 'service_role', true); INSERT INTO profiles ... role='admin'; COMMIT;` | **TRIGGER FIRES** — `v_effective_role='service_role'` → Branch 1 matches → **ALLOWS** if trigger trusts Branch 1 alone | **Critical test** |
| B.5 | As `authenticated` with temp grant: `GRANT INSERT(role) ON profiles TO authenticated; BEGIN; SELECT set_config('role', 'service_role', true); INSERT ... role='admin'; COMMIT;` | Same as B.4 — tests trigger bypass | **Critical test** |
| B.6 | As `service_role`: `INSERT INTO profiles ... role='admin';` | **SUCCEEDS** — positive control | Expected |
| B.7 | As `postgres` (SQL Editor): `INSERT INTO profiles ... role='admin';` | **SUCCEEDS** — `v_effective_role='none'`, `session_user='postgres'` → Branch 2 matches | Expected |

### 5.3 C. Profile Privilege Enforcement Tests

| Test ID | HTTP/SQL | Expected Outcome |
|---------|----------|------------------|
| C.1 | `POST /rest/v1/profiles` (user JWT) with `{"id": "user_b", "role": "admin"}` | **400/42501** — column ACL blocks before trigger |
| C.2 | `PATCH /rest/v1/profiles?id=eq.user_a` (user JWT) with `{"role": "admin"}` | **400/42501** — column ACL blocks before trigger |
| C.3 | `PATCH /rest/v1/profiles?id=eq.user_a` (user JWT) with `{"display_name": "New Name"}` | **200/204** — safe column update succeeds |
| C.4 | `POST /rest/v1/profiles` (service key) with `{"id": "new_admin", "role": "admin"}` | **201** — service role can provision admin |
| C.5 | `POST /rest/v1/profiles` (anon key) with any body | **401/403** — anon has no INSERT grant |

**HTTP Examples (Placeholders Only):**

```bash
# C.1 — Authenticated user attempts admin insert
curl -X POST "https://STAGING_PROJECT_REF.supabase.co/rest/v1/profiles" \
  -H "apikey: STAGING_ANON_KEY" \
  -H "Authorization: Bearer USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "display_name": "Test", "role": "admin"}'

# C.3 — Authenticated user updates safe column
curl -X PATCH "https://STAGING_PROJECT_REF.supabase.co/rest/v1/profiles?id=eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" \
  -H "apikey: STAGING_ANON_KEY" \
  -H "Authorization: Bearer USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"display_name": "Updated Name"}'

# C.4 — Service role provisions admin
curl -X POST "https://STAGING_PROJECT_REF.supabase.co/rest/v1/profiles" \
  -H "apikey: STAGING_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer STAGING_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "display_name": "Admin User", "role": "admin"}'
```

### 5.4 D. Trigger Verification

| Test ID | Action | Verification |
|---------|--------|--------------|
| D.1 | `SELECT pg_get_functiondef('public.streamkit_guard_profile_role()'::regprocedure);` | Body matches canonical migration exactly |
| D.2 | `SELECT * FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'streamkit_guard_profile_role';` | `tgenabled='O'`, `tgtype` = BEFORE ROW INSERT+UPDATE, `tgfoid` = trigger function |
| D.3 | `SELECT has_function_privilege('authenticated', 'public.streamkit_guard_profile_role()', 'EXECUTE');` | `false` |
| D.4 | `SELECT has_function_privilege('service_role', 'public.streamkit_guard_profile_role()', 'EXECUTE');` | `false` |

### 5.5 E. End-to-End PostgREST HTTP Tests

| Test ID | Request | Expected HTTP | Expected SQLSTATE | Notes |
|---------|---------|---------------|-------------------|-------|
| E.1 | Authenticated: `INSERT profiles (role='admin')` | 400 | `42501` (insufficient_privilege) | Column ACL |
| E.2 | Authenticated: `UPDATE profiles SET role='admin'` | 400 | `42501` | Column ACL |
| E.3 | Authenticated: `INSERT profiles (safe cols only)` | 201 | — | Success |
| E.4 | Authenticated: `UPDATE profiles SET display_name='x'` | 200/204 | — | Success |
| E.5 | Service: `INSERT profiles (role='admin')` | 201 | — | Success |
| E.6 | Service: `UPDATE profiles SET role='creator'` | 200/204 | — | Success |
| E.7 | Service: `DELETE profiles` | 400/42501 | `42501` | No DELETE grant |
| E.8 | Anon: `SELECT profiles` | 200 | — | Success |
| E.9 | Anon: `INSERT profiles` | 401/403 | — | No grant |
| E.10 | Authenticated: cross-user `UPDATE` | 200 (0 rows) | — | RLS filters |

---

## 6. Expected Results and Interpretation

### 6.1 Decision Matrix

| Staging Outcome | Verdict | Action |
|-----------------|---------|--------|
| All tests pass (B.4 blocks, trigger body verified, membership clean) | **READY FOR STAGING TEST APPROVAL** → Safe to apply to production after separate review | Apply canonical migration to production |
| B.4 **allows** admin insert via `set_config('role', 'service_role', true)` | **NOT READY — DESIGN ISSUE FOUND** | Hardening required: tighten Branch 1 to require `session_user='service_role'` |
| Trigger body differs from canonical | **NOT READY — DESIGN ISSUE FOUND** | Investigate drift; do not apply |
| `authenticator` has unexpected membership path to privileged role | **INCONCLUSIVE — MORE INVESTIGATION REQUIRED** | Full membership audit needed |
| PostgREST behaves differently than SQL tests | **INCONCLUSIVE — MORE INVESTIGATION REQUIRED** | Test via actual HTTP, not just SQL |

### 6.2 Critical Interpretation Notes

- **HTTP status alone is NOT proof** — must capture `SQLSTATE` from response body (`{"code":"42501",...}`)
- **Trigger Branch 1 is the pivot** — if `set_config('role', 'service_role', true)` can be called in the same transaction as the profile write, the trigger will trust it
- **No application path calls `set_config('role', ...)`** — verified by static scan; but staging must confirm no hidden path
- **`authenticator` membership in `service_role` is REQUIRED for legitimate operation** — the migration post-check does not verify this; staging must

---

## 7. Cleanup and Rollback Plan

### 7.1 Test Data Cleanup (After Experiment)

```sql
-- Run as service_role in staging database
DELETE FROM auth.users
WHERE email LIKE 'staging-test-%@example.test';

DELETE FROM public.profiles
WHERE id IN (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);

-- Verify cleanup
SELECT count(*) FROM auth.users WHERE email LIKE 'staging-test-%@example.test';  -- must be 0
SELECT count(*) FROM public.profiles WHERE id IN (...);  -- must be 0
```

### 7.2 Temporary Grants Cleanup

```sql
-- If any GRANT was issued for testing (e.g., test B.5)
REVOKE INSERT (role) ON public.profiles FROM authenticated;
REVOKE UPDATE (role) ON public.profiles FROM authenticated;
```

### 7.3 Staging Project Disposal

| Step | Action |
|------|--------|
| 1 | Confirm all test users deleted |
| 2 | Confirm no temporary grants remain |
| 3 | Delete Supabase staging project via dashboard |
| 4 | Rotate any service keys used (even placeholders) |

### 7.4 Production Backup (Before Any Authorized Production Apply)

| Artifact | Backup Method |
|----------|---------------|
| Database schema + data | Supabase Point-in-Time Recovery (PITR) or `pg_dump` |
| Auth users | Export via Admin API |
| Storage buckets | Download via Supabase dashboard or `s3cmd` |
| Environment variables | Screenshot/export from Vercel/Supabase dashboard |

---

## 8. Risks and Unresolved Questions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `set_config('role', 'service_role', true)` callable via undiscovered RPC path | Low (scan found none) | High (bypasses trigger) | Staging test B.4; code audit |
| `authenticator` member of unexpected privileged role | Unknown | High | Staging test A.1–A.6 |
| Trigger body drift in live DB | Unknown | High | Staging test D.1 |
| PostgREST pooled connection reuses `SET ROLE` state | Low (per-request) | Medium | Staging test E.* with real HTTP |
| Migration post-check misses `authenticator` membership | **Confirmed gap** | Medium | Staging test A.1; add to post-check |

### Unresolved Questions Requiring Staging

1. **Can `authenticated` call `set_config('role', 'service_role', true)` in any execution context?** (Tests B.2, B.4)
2. **Is `authenticator` a member of `service_role` in the live database?** (Test A.1)
3. **Does the live trigger body exactly match the canonical migration?** (Test D.1)
4. **Are there any indirect membership paths from `authenticated` → `...` → `authenticator` → `service_role`?** (Test A.2)
5. **Does PostgREST's connection pooler reset `current_setting('role')` between requests?** (Test E.*)

---

## 9. Final Recommendation

### Current State (Pre-Staging)

| Finding | Classification |
|---------|----------------|
| Migration post-check omits `authenticator` membership | **VERIFIED** (code inspection) |
| `set_config('role', ...)` bypasses membership checks | **VERIFIED** (PostgreSQL semantics) |
| Trigger Branch 1 trusts `current_setting('role')='service_role'` alone | **VERIFIED** (canonical migration line 258) |
| No repo function exposes `set_config('role', ...)` | **VERIFIED** (full function scan) |
| No application path writes `role` column | **VERIFIED** (code inspection) |
| Live database `authenticator` membership state | **UNKNOWN** (requires staging) |
| Live trigger body matches canonical | **UNKNOWN** (requires staging) |
| PostgREST HTTP behavior matches SQL tests | **UNKNOWN** (requires staging) |

### **VERDICT: INCONCLUSIVE — REQUIRES CONTROLLED STAGING EXPERIMENT**

**Reasoning:** The critical gap is whether an authenticated user can influence `current_setting('role')` to `'service_role'` within the same transaction as a profile write. While no exposed function does this in the repository, and PostgREST architecture should prevent it, the following cannot be proven from static analysis alone:

1. Live database role memberships (especially `authenticator` ∈ `service_role`)
2. Actual trigger body deployed in production
3. End-to-end PostgREST behavior with real connection pooling

**The staging experiment defined in this plan will resolve all unknowns.**

---

## 10. Approval Gates

This plan **must not be executed** until all the following are explicitly approved:

- [ ] Staging project created and isolated from production
- [ ] `STAGING_PROJECT_REF`, `CONFIRM_STAGING_PROJECT_REF`, `ALLOW_REMOTE_STAGING=yes` recorded
- [ ] All team members acknowledge this is a **disposable** experiment
- [ ] Production backup verified (PITR enabled, recent snapshot)
- [ ] Migration apply window scheduled separately (this plan only covers verification)
- [ ] Rollback/cleanup plan reviewed and accepted

**Stop after delivering this plan. Await explicit approval before any staging operations.**