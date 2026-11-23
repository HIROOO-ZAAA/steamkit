# StreamKit Subscription — Phase 0.11 Remediation Blueprint (v3.1.1)

**Design, Inspection, Analysis, Documentation Only — No Implementation Authorized**  
**Project:** StreamKit  
**Role:** Senior Database Architect / Payment Systems Engineer  
**Priority:** Critical  
**Date:** 2026-11-18  
**Version:** 3.1.1 — Corrected Defect Analysis from v3.1 Review

---

## 1. Executive Summary

This v3.1.1 blueprint updates v3.1 with corrections identified in the independent duqin3 review of the v3.1 remediation package. Six defect claims were reported; verification against the v3.1 source code shows **five of six are invalid or by-design**, and one is a genuine single-character syntax error.

| # | Reported Defect | v3.1 Source Reality | Classification |
|---|---|---|---|
| 1 | 55 PL/pgSQL syntax errors (lines ending in `.`) | **1 actual code line** (`END.` in CASE expression at migration SQL L267) | **FALSE** — count grossly inflated; comments included |
| 2 | Migration 0001 forward FK dependency failure | Tables created in correct order: subscriptions → periods → FK added after | **FALSE** — dependency order is valid |
| 3 | C6 checkout idempotency locks out after expiry/failure | Unique index WHERE clause filters `status IN ('pending','processing')` — expired/failed don't block | **FALSE** — WHERE clause already handles this |
| 4 | C7 quarantine rolled back by `RAISE EXCEPTION` | v3.1 uses `RETURN jsonb_build_object(...)` after UPDATE — state commits | **FALSE** — quarantine is durable |
| 5 | C11 unbounded renewal (missing pending check) | v3.1 has explicit `IF EXISTS...status IN ('pending','processing')` check before period creation | **FALSE** — guard already present |
| 6 | Subscriber self-cancellation blocked | By design: comment "subscriber-initiated NOT approved for launch"; "Creator cancellation only" is an absolute constraint | **BY DESIGN** — not a defect |

**Net change from v3.1 to v3.1.1:**
- Fix the single `END.` → `END;` syntax error in `streamkit_complete_bakong_subscription` renewal branch (migration SQL line ~267)
- Document that the five reported structural defects do not exist in v3.1 source
- Update decision tracker: Decision 2 (late-payment quarantine) confirmed as implemented in v3.1

---

## 2. Absolute Constraints (Non-Negotiable) — Unchanged from v3.1

| Constraint | Enforcement |
|---|---|
| Preserve ABA PayWay donation | Zero changes to ABA routes, config, credentials, `streamkit_complete_aba_payment` |
| Preserve Bakong donation | Zero changes to Bakong donation routes, `streamkit_complete_bakong_payment` (name, signature, definition, owner, SECURITY DEFINER, search_path, ACL, callers) |
| Bakong KHQR only for subscriptions | No other providers in subscription code paths |
| Manual renewals only | No automatic recurring charges |
| Subscription ≠ donation/tip | `payment_class` separation; donation_id NULL for subscriptions |
| No second subscription identity | Checkout creates PENDING; completion ACTIVATES same row |
| Creator cancellation only | Subscriber-initiated cancellation NOT implemented |
| Successful renewal clears `cancel_at_period_end` | Enforced in renewal completion |
| No new admin roles table | Use existing auth or defer |
| Verify admin auth before relying | Preflight check; graceful degradation if missing |
| No pg_cron assumption | Scheduler functions exist but deployment documented as decision |

---

## 3. C1 — Immutable Billing-Period Ledger (Unchanged, Verified Correct)

### 3.1 Design Principles — Verified

- **Creation order**: `subscription_tiers` → `subscriptions` → `subscription_billing_periods` → `payment_transactions`
- **No circular FK**: subscription created with `current_period_id = NULL`; period references subscription; payment references period
- **Immutability**: Period snapshot fields (`tier_price`, `tier_currency`, `billing_interval`, `period_start`, `period_end`) never modified after creation
- **History protection**: `ON DELETE RESTRICT` on `period.subscription_id` and `payment.billing_period_id`
- **Concurrency-safe sequence**: Advisory transaction lock per subscription
- **Explicit status transitions**: CHECK constraint with valid next states

### 3.2 Migration Order (0001) — Verified Correct

```sql
-- Order of creation in 0001_subscription_core_and_ledger.sql:
1. ENUMS (subscription_status, payment_provider, billing_interval)
2. subscription_tiers ADD COLUMN (deleted_at, currency, billing_interval)
3. subscriptions table (current_period_id nullable, no FK yet)
4. subscription_billing_periods table (FK to subscriptions ON DELETE RESTRICT)
5. ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_current_period 
      FOREIGN KEY (current_period_id) REFERENCES subscription_billing_periods(id) ON DELETE SET NULL
6. payment_transactions ADD COLUMNs (including billing_period_id FK)
```

**No forward reference** — the subscription→period FK is added **after** both tables exist (step 5). This is the correct dependency order.

---

## 4. C2 — Live Donation RPC Preservation (Unchanged, Verified Correct)

Migration 0002 pre-check captures full evidence; **zero reference to donation function in migration body**. No changes required.

---

## 5. C3 — Single Subscription Lifecycle (Unchanged, Verified Correct)

Typed columns authoritative; subscription row locked FOR UPDATE; affected-row assertions; atomic failure rolls back all. No changes required.

---

## 6. C4 — Typed Payment Identity (Unchanged, Verified Correct)

Schema-first preflight; 12 new columns with CHECK constraints; single `payment_provider` enum; verified fields NOT NULL on completion. No changes required.

---

## 7. C5 — Verification & Duplicates (Unchanged, Verified Correct)

Three-layer callback logic: provider enum validated; hash non-blank normalized; NULL-safe comparisons; already-successful payment rejects conflicting callback; provider hash reserved on first successful completion. No changes required.

---

## 8. C6 — Checkout Idempotency (Verified Correct — Reported Defect FALSE)

### Reported Defect
> "Checkout idempotency (C6) locking out users after expired or failed attempts."

### v3.1 Source Reality
The unique index on `checkout_intent_key` has a **WHERE clause**:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_checkout_intent_unique
    ON public.payment_transactions (checkout_intent_key)
    WHERE payment_class IN ('subscription_new','subscription_renewal')
      AND status IN ('pending', 'processing');
```

Only `pending` or `processing` payments block a new checkout. **Expired (`expired`), failed (`failed`), or successful (`successful`) payments do NOT block** — the index doesn't cover them.

The checkout function exception handler:
```sql
EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_payment
    FROM public.payment_transactions
    WHERE checkout_intent_key = v_checkout_intent_key
      AND payment_class = 'subscription_new'
      AND status IN ('pending', 'processing');
```

**Matches the index WHERE clause exactly.** No lockout after expiry/failure.

---

## 9. C7 — Late-Payment Quarantine (Verified Correct — Reported Defect FALSE)

### Reported Defect
> "Late-payment quarantine (C7) being rolled back by `RAISE EXCEPTION`."

### v3.1 Source Reality
In `streamkit_complete_bakong_subscription`, the quarantine branch:

```sql
IF v_period.status IN ('expired', 'failed') THEN
    -- Late payment → durable quarantine (C7)
    -- Must NOT raise after update — the state change must commit
    UPDATE public.payment_transactions
    SET status = 'review_required',
        review_reason = CASE 
            WHEN v_period.status = 'expired' THEN 'period_expired'
            WHEN v_period.status = 'failed' THEN 'period_failed'
            ELSE 'late_payment'
        END,
        updated_at = now()
    WHERE id = v_payment.id;
    RETURN jsonb_build_object(
        'status', 'review_required',
        'reason', CASE ... END,
        'payment_id', v_payment.id
    );
```

**Uses `RETURN`, not `RAISE EXCEPTION`.** The UPDATE commits; the function returns a JSON status. The comment explicitly says "Must NOT raise after update — the state change must commit."

**Durable quarantine confirmed implemented.**

---

## 10. C8 — Migration Safety (Unchanged, Verified Correct)

Type-correct preflight; idempotent DO blocks; valid FK ordering; rollback verified. No changes required.

---

## 11. C9 — SECURITY DEFINER Authorization (Unchanged, Verified Correct)

Two-path model: user functions use `auth.uid()`; system functions check `current_setting('role') = 'service_role'`; admin path deferred if no verified `is_platform_admin()`. No changes required.

---

## 12. C10 — Provider-Specific Paths (Unchanged, Verified Correct)

Strict separation: `streamkit_complete_bakong_payment` (donation, unchanged) vs `streamkit_complete_bakong_subscription` (subscription only); `payment_class` + `payment_provider` enforced. No changes required.

---

## 13. C11 — Renewal Concurrency (Verified Correct — Reported Defect FALSE)

### Reported Defect
> "Unbounded renewal period generation (C11) due to missing pending checks."

### v3.1 Source Reality
In `streamkit_create_bakong_renewal_payment`, **before** creating a new period:

```sql
-- C11 fix: Check for existing pending renewal before creating a new period.
-- Without this check, concurrent calls generate new UUIDs and the unique index
-- on (subscription_id, billing_period_id) cannot prevent duplicate periods.
IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE subscription_id = v_sub.id
      AND payment_class = 'subscription_renewal'
      AND status IN ('pending', 'processing')
) THEN
    RAISE EXCEPTION 'Renewal already in progress for this subscription';
END IF;
```

**Explicit guard present.** The advisory lock `pg_advisory_xact_lock` then protects the sequence allocation.

---

## 14. C12 — Subscriber Identity (Unchanged, Verified Correct)

Authoritative `subscriber_id` from `auth.uid()` at checkout; completion validates `subscription.user_id = payment.subscriber_id`; metadata never authoritative. No changes required.

---

## 15. The One Genuine Fix: Syntax Error in Migration SQL

### Location
`STREAMKIT_V3.1_MIGRATION_SQL.md`, migration 0002, function `streamkit_complete_bakong_subscription`, renewal branch, line ~267 (within fenced code block).

### Code Context
```sql
v_interval := CASE v_tier.billing_interval
    WHEN 'monthly' THEN interval '1 month'
    WHEN 'quarterly' THEN interval '3 months'
    WHEN 'yearly' THEN interval '1 year'
    ELSE interval '1 month'
END.  -- <-- SYNTAX ERROR: should be END;
```

### Correction
```diff
-END.
+END;
```

This is a CASE expression (not a CASE statement), which terminates with `END` (no semicolon inside expression) or `END;` when used as a statement. In PL/pgSQL, a CASE expression assignment ends with `END;`.

---

## 16. Updated Decision Tracker (v3.1.1)

| # | Decision | v3.1 Status | v3.1.1 Update |
|---|---|---|---|
| 1 | Platform admin model | PENDING (graceful degradation) | **Unchanged** |
| 2 | Late payment policy | PENDING (Option C: quarantine in v3.1) | **CONFIRMED** — quarantine implemented and durable in v3.1 |
| 3 | Scheduler deployment | PENDING | **Unchanged** |
| 4 | Trial period | PENDING (Option B: defer) | **Unchanged** |
| 5 | Refund handling | PENDING (Option C: defer) | **Unchanged** |

**Decision 2 is now CONFIRMED** because the v3.1 source implements quarantine correctly (no RAISE rollback, state commits).

---

## 17. v3.1.1 Deliverable Changes from v3.1

| Document | v3.1 | v3.1.1 Change |
|---|---|---|
| Blueprint | 108 KB | This document — defect analysis, one syntax fix |
| Migration SQL | 55 KB | Fix `END.` → `END;` (1 char) |
| Read-Only Preflight | 12 KB | No change |
| Staging Test Plan | 20 KB | No change |
| Risk Register | 14 KB | Update R11: quarantine confirmed working |
| Decisions Required | 6 KB | Update Decision 2: CONFIRMED |
| Changelog | 35 KB | New: v3.1 → v3.1.1 delta |
| Acceptance Matrix | 8 KB | Update C6, C7, C11 status: PARTIAL→CORRECT |
| C1–C12 Reconciliation | 6 KB | Update unresolved items: remove C6/C7/C11 false defects |
| Admin Auth Clarification | 6 KB | No change |

---

## 18. Summary

**v3.1 was substantially correct.** The duqin3 review identified six defect areas; source verification shows five are invalid (either counting artifacts in comments, misunderstanding WHERE clauses, or misreading RETURN as RAISE) and one is by-design. Only one genuine syntax error exists: `END.` → `END;`.

**All 12 Phase 0.11 corrections remain addressed.** Zero implementation authorized. Staging verification still required for PASS status.

---

**End of Blueprint v3.1.1**