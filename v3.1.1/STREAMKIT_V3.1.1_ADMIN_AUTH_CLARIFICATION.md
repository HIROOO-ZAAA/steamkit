# StreamKit v3.1.1 — Admin Authorization Clarification

**Design Only — No Implementation Authorized**  
Documents existing evidence, required read-only checks, and deferral strategy for administrative actions.

**IDENTICAL to v3.1 — no changes required**

---

## 1. Existing Admin Authorization Evidence

### 1.1 Live Database Check (Preflight Section 8)

| Check | Query | Expected Evidence |
|---|---|---|
| Platform admin function exists | `SELECT proname FROM pg_proc WHERE proname = 'is_platform_admin'` | Function may or may not exist |
| Profiles table has role column | `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='role'` | Column may or may not exist |
| Existing admin users | `SELECT * FROM profiles WHERE role='admin' OR is_platform_admin(id)` | Current admin assignments |
| Service-role usage | `SELECT * FROM pg_roles WHERE rolname='service_role'` | Service-role exists (Supabase default) |

### 1.2 Current Function Grants (Preflight Section 8.1)

| Function | Granted To | Notes |
|---|---|---|
| `streamkit_complete_bakong_payment` | `postgres` (owner), `service_role` | Live donation function |
| `streamkit_complete_aba_payment` | `postgres`, `service_role` | Live donation function |
| (new) `streamkit_cancel_subscription_admin` | **requires** `is_platform_admin()` | Migration 0002 references this |
| (new) `streamkit_cancel_subscription_system` | `service_role` | Scheduler path |
| (new) `streamkit_process_cancellations` | `service_role` | Scheduler path |

---

## 2. Required Read-Only Checks (Pre-Migration)

### 2.1 Mandatory Preflight Checks

```sql
-- Check 1: Does is_platform_admin() exist?
SELECT proname, pg_get_functiondef(oid) 
FROM pg_proc WHERE proname = 'is_platform_admin';

-- Check 2: Does profiles.role exist?
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name='profiles' AND column_name='role';

-- Check 3: Current admin users
SELECT id, username, role FROM profiles WHERE role='admin';

-- Check 4: Service-role capabilities
SELECT has_function_privilege('service_role', 'streamkit_cancel_subscription_admin(uuid)', 'EXECUTE');
```

### 2.2 Decision Matrix Based on Findings

| Finding | Path Forward |
|---|---|
| `is_platform_admin()` exists + works | Use existing; migration 0002 proceeds |
| `profiles.role` column exists + has admins | Implement `is_platform_admin(uid)` as `SELECT role='admin' FROM profiles WHERE id=uid`; add before 0002 |
| Neither exists + no admins | **Defer admin cancellation**: keep `streamkit_cancel_subscription_admin` but make it call `RAISE EXCEPTION 'Admin auth not configured'`; only `service_role` (scheduler) and user cancellation work at launch |
| Service-role only | All admin actions via scheduler/backend; no authenticated admin API |

---

## 3. Subscription Design: Deferral Strategy

### 3.1 Three Cancellation Paths (Already Designed)

| Path | Function | Auth | Status |
|---|---|---|---|
| **User-initiated** | `streamkit_cancel_subscription_user` | `auth.uid()` = creator | ✅ Ready — no admin needed |
| **Admin-initiated** | `streamkit_cancel_subscription_admin` | `is_platform_admin(auth.uid())` | ⚠️ **Deferred** — requires auth verification |
| **System/Scheduler** | `streamkit_cancel_subscription_system` | `service_role` | ✅ Ready — runs via pg_cron |

### 3.2 Deferral Implementation (No Code Change to Migration)

**Option A: Graceful Degradation (Recommended)**

```sql
-- In migration 0002, create admin function with fallback:
CREATE OR REPLACE FUNCTION public.streamkit_cancel_subscription_admin(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Check if admin auth is available
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_platform_admin') THEN
        RAISE EXCEPTION 'Admin authorization not configured. Use service-role or user cancellation.';
    END IF;
    
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Platform admin required';
    END IF;
    
    -- ... rest of cancellation logic
END $$;
```

**Option B: Stub Function**

```sql
-- Create stub that always fails until auth is configured
CREATE OR REPLACE FUNCTION public.streamkit_cancel_subscription_admin(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'Administrative cancellation not yet enabled. Contact platform team.';
END $$;
```

### 3.3 Launch Readiness Without Admin Cancellation

| Feature | Available at Launch? |
|---|---|
| Creator schedules cancellation | ✅ Yes (`streamkit_cancel_subscription_user`) |
| Scheduled cancellation at period end | ✅ Yes (`streamkit_process_cancellations` via pg_cron) |
| Expiration of past_due subscriptions | ✅ Yes (`streamkit_expire_due_subscriptions` via pg_cron) |
| **Immediate admin cancellation** | ❌ **Deferred** (requires auth verification) |
| **Admin dashboard for cancellations** | ❌ **Deferred** (requires auth + UI) |

**Impact: Minimal.** Core subscription lifecycle (creator cancellation, scheduled cancellation, expiration) works fully. Admin immediate cancellation is an operational convenience, not a subscriber-facing feature.

---

## 4. Recommended Path

1. **Run preflight checks** (Section 2.1) against live database
2. **If admin auth exists** → proceed with migration 0002 as-is
3. **If admin auth missing** → use Option A (graceful degradation) in migration 0002; defer full admin cancellation to Phase 1
4. **Document decision** in `STREAMKIT_V3.1.1_DECISIONS_REQUIRED.md` Decision 1

---

## 5. No New Admin System Approved

This document **does not propose** creating:
- New `platform_roles` table
- New `is_platform_admin()` implementation
- Any admin authorization infrastructure

It only:
- Documents what exists (via read-only checks)
- Provides deferral path so migration 0002 doesn't block
- Keeps Phase 0 scope intact

**Phase 1 can implement proper admin authorization after launch.**

---

**End of Admin Authorization Clarification v3.1.1**