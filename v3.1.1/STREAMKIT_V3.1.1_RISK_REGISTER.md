# StreamKit v3.1.1 — Risk Register

**Design Only — No Implementation Authorized**  
**Updated from v3.1 with defect analysis corrections**

---

## Risk Classification

| Severity | Definition |
|---|---|
| **CRITICAL** | Blocks migration; data loss or security breach possible |
| **HIGH** | Requires Project Owner decision; significant behavior change |
| **MEDIUM** | Mitigable with design/test; may delay launch |
| **LOW** | Acceptable with monitoring; minor operational impact |

---

## Risks

### R1 — Admin Authorization Function Missing
| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Category** | Authorization |
| **Description** | Migration 0002 references `public.is_platform_admin(uuid)` but function doesn't exist in live DB |
| **Impact** | Migration 0002 fails; admin cancellation path broken |
| **Likelihood** | Certain (function not found in preflight) |
| **Mitigation** | Project Owner must choose and implement before 0002: (1) Use existing admin function if present, (2) Create simple role check if profile exists, (3) Use graceful degradation (defer admin cancellation) |
| **Owner Decision Required** | YES — before Migration 0002 |
| **Test Coverage** | T49, T50 |
| **v3.1.1 Change** | **Unchanged from v3.1** — graceful degradation |

---

### R2 — Live Bakong Grace/Window Behavior Unverified
| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Category** | Payment Integrity |
| **Description** | v3.1 implements exact live validation: `provider_paid_at` in `[created_at - 1min, expires_at]`, 5-min expiry, but live behavior not confirmed by preflight |
| **Impact** | Valid payments rejected OR invalid payments accepted; financial loss or user complaints |
| **Likelihood** | High (v2.3/v2.4 had different behavior) |
| **Mitigation** | Preflight Section 3 captures exact live function; Project Owner must verify before 0002 |
| **Owner Decision Required** | YES — before Migration 0002 |
| **Test Coverage** | T13, T24, T25 |
| **v3.1.1 Change** | **Unchanged from v3.1** — exact live validation |

---

### R3 — `donation_id` NOT NULL in Live Database
| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Category** | Migration Safety |
| **Description** | Preflight check 1.1 requires `donation_id` nullable; if live has NOT NULL, subscription payments (donation_id=NULL) cannot be inserted |
| **Impact** | Migration 0001 fails or subscription payments blocked |
| **Likelihood** | Medium (depends on live schema) |
| **Mitigation** | Preflight validation (0000) fails fast; if NOT NULL, manual ALTER COLUMN required before migration |
| **Owner Decision Required** | YES — if validation fails |
| **Test Coverage** | T53 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R4 — Existing `subscriptions` Table Incompatible
| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Category** | Migration Safety |
| **Description** | Preflight check 1.4 detects existing `subscriptions` table without `current_period_id` column |
| **Impact** | Migration 0001 `CREATE TABLE IF NOT EXISTS` skips creation; schema mismatch persists |
| **Likelihood** | Low (preflight indicates table doesn't exist) |
| **Mitigation** | Preflight fails fast; manual reconciliation required if table exists |
| **Owner Decision Required** | YES — if preflight detects |
| **Test Coverage** | T54 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R5 — Migration Tracking Unknown
| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Category** | Operations |
| **Description** | No `supabase_migrations.schema_migrations` table visible; cannot confirm which migrations applied |
| **Impact** | Duplicate migration attempts or missed migrations |
| **Likelihood** | High (no evidence in repo/schema) |
| **Mitigation** | Idempotent migrations (IF NOT EXISTS, DO blocks, CREATE OR REPLACE); manual verification after each step |
| **Owner Decision Required** | NO — handled by design |
| **Test Coverage** | T52, T57 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R6 — Period Ledger FK Performance
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Performance |
| **Description** | `subscription_billing_periods` has FK to `subscriptions` and `payment_transactions`; high-volume subscriptions may cause lock contention |
| **Impact** | Slight latency on payment completion; deadlock risk under extreme concurrency |
| **Likelihood** | Low (deterministic lock order prevents deadlocks) |
| **Mitigation** | Indexes on `subscription_id` and `payment_id`; lock order payment→period→subscription; monitor in staging |
| **Owner Decision Required** | NO |
| **Test Coverage** | T38, T26 |
| **v3.1.1 Change** | **Unchanged from v3.1** — C1 immutable ledger adds `ON DELETE RESTRICT` |

---

### R7 — Tier Price Change During QR Pending
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Payment Integrity |
| **Description** | Tier price/currency can change between checkout (5-min QR) and payment completion |
| **Impact** | Completion rejects with "Amount/currency mismatch with billing period"; user must re-checkout |
| **Likelihood** | Very Low (tiers rarely change price; 5-min window) |
| **Mitigation** | Period stores authoritative `tier_price`/`tier_currency` at checkout; completion validates against period, not current tier |
| **Owner Decision Required** | NO |
| **Test Coverage** | T15 |
| **v3.1.1 Change** | **Unchanged from v3.1** — C1 period ledger makes this explicit |

---

### R8 — ABA Donation Trigger on Subscription Payment
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Payment Integrity |
| **Description** | If `payment_class` routing fails, subscription payment could enter ABA donation flow |
| **Impact** | Donation/tip created for subscription; data corruption |
| **Likelihood** | Very Low (completion RPC validates `payment_class` first) |
| **Mitigation** | `streamkit_complete_bakong_subscription` checks `payment_class IN ('subscription_new','subscription_renewal')` at start; ABA webhook only calls ABA function |
| **Owner Decision Required** | NO |
| **Test Coverage** | T12, T48 |
| **v3.1.1 Change** | **Unchanged from v3.1** — C4 typed payment_class |

---

### R9 — Idempotency Secret Configuration (v3.0 HMAC) — **REMOVED in v3.1**
| Field | Value |
|---|---|
| **Severity** | **N/A** |
| **Category** | Configuration |
| **Description** | v3.0 required `app.checkout_idempotency_secret` for HMAC; v3.1 uses server-issued deterministic SHA256 key |
| **Impact** | Eliminated — no secret needed |
| **Mitigation** | N/A — v3.1 design removes this risk entirely |
| **Owner Decision Required** | NO |
| **v3.1.1 Change** | **C6: UUID deterministic key replaces HMAC — risk eliminated** |

---

### R10 — Concurrent Renewal Race Condition
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Concurrency |
| **Description** | Two concurrent renewal payment creations could create Period 2 and Period 3 simultaneously |
| **Impact** | Both periods created; second renewal payment links to Period 3 |
| **Likelihood** | Low (service-role only; subscriber initiates manually) |
| **Mitigation** | `get_next_period_sequence` uses `LOCK TABLE ... IN SHARE MODE`; unique index on `(subscription_id, period_sequence)` |
| **Owner Decision Required** | NO |
| **Test Coverage** | T27 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R11 — Late Payment Policy (C7: Quarantine) — **CONFIRMED WORKING in v3.1**
| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Category** | Product Decision |
| **Description** | v3.1 implements quarantine (`review_required`) for late/ambiguous payments — **NO assumed grace period**. This policy must be confirmed. |
| **Impact** | Revenue recognition timing; user experience for failed payments |
| **Likelihood** | Certain (policy explicitly implemented) |
| **Mitigation** | Documented as Project Owner Decision #2; v3.1 implements quarantine (Option C) — NOT grace extension. **v3.1.1 CONFIRMED: quarantine is durable (uses RETURN not RAISE)** |
| **Owner Decision Required** | YES — before Migration 0002 (Decision CONFIRMED implemented) |
| **Test Coverage** | T24, T25 |
| **v3.1.1 Change** | **Same as v3.1 — C7: quarantine (Option C) — VERIFIED durable in source** |

---

### R12 — Scheduler Deployment Method Unknown
| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Category** | Operations |
| **Description** | No pg_cron, Edge Functions, or external scheduler confirmed in infrastructure |
| **Impact** | Cancellations/expirations never processed → subscriptions stuck in past_due |
| **Likelihood** | High (not in repo) |
| **Mitigation** | Documented as Project Owner Decision #3; functions ready, just need scheduling |
| **Owner Decision Required** | YES — before launch |
| **Test Coverage** | T36–T43 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R13 — Refund Handling Undefined
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Product Decision |
| **Description** | No refund RPC for subscriptions; donation refund may not apply |
| **Impact** | Manual refund process required post-launch |
| **Likelihood** | Certain (out of Phase 0 scope) |
| **Mitigation** | Documented as Project Owner Decision #5; Phase 1 item |
| **Owner Decision Required** | YES — Phase 1 |
| **Test Coverage** | N/A |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R14 — Trial Period Undefined
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Product Decision |
| **Description** | `trial_end` column exists but no trial logic implemented |
| **Impact** | Trial subscriptions not functional |
| **Likelihood** | Certain (out of Phase 0 scope) |
| **Mitigation** | Documented as Project Owner Decision #4; Phase 1 item |
| **Owner Decision Required** | YES — Phase 1 |
| **Test Coverage** | N/A |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R15 — Backup/Restore Procedure Untested
| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Category** | Operations |
| **Description** | Staging restore procedure documented but not validated |
| **Impact** | If migration fails, rollback may not restore live donation functions correctly |
| **Likelihood** | Medium |
| **Mitigation** | T55, T56 require staging verification before production |
| **Owner Decision Required** | NO |
| **Test Coverage** | T55, T56 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R16 — Duplicate Initial Subscription Creation (Race at Checkout)
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Concurrency |
| **Description** | Two concurrent checkout requests could create two subscription intents before unique index catches them |
| **Impact** | Two pending subscriptions, two periods, two payments — second checkout re-selects first via intent key |
| **Likelihood** | Low (intent key is deterministic per subscriber+tier; race only if same session fires twice simultaneously) |
| **Mitigation** | Unique index on `checkout_intent_key`; exception handler re-SELECTs existing; active subscription check blocks subsequent |
| **Owner Decision Required** | NO |
| **Test Coverage** | T08 |
| **v3.1.1 Change** | **Unchanged from v3.1** — C6: deterministic SHA256 intent key |

---

### R17 — Provider Hash Collision (Theoretical)
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Payment Integrity |
| **Description** | Two different Bakong transactions could theoretically produce same `provider_hash` |
| **Impact** | Second payment rejected as duplicate |
| **Likelihood** | Negligible (Bakong transaction hashes are cryptographically unique) |
| **Mitigation** | Global unique index on `provider_hash` WHERE successful; if collision, manual review |
| **Owner Decision Required** | NO |
| **Test Coverage** | T70 |
| **v3.1.1 Change** | **Unchanged from v3.1** |

---

### R18 — Live Donation Function Preservation (C2)
| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Category** | Preservation |
| **Description** | v3.1 must verify live `streamkit_complete_bakong_payment` exists and matches Phase A evidence |
| **Impact** | Migration 0002 fails if live function not found |
| **Likelihood** | Medium (evidence from preflight) |
| **Mitigation** | Preflight Section 2 captures exact evidence; Project Owner must confirm |
| **Owner Decision Required** | YES — before Migration 0002 |
| **Test Coverage** | T01–T05 |
| **v3.1.1 Change** | **Unchanged from v3.1** — C2: live function preservation |

---

### R19 — Syntax Error in Migration SQL (v3.1 only)
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Code Quality |
| **Description** | `END.` instead of `END;` in CASE expression in `streamkit_complete_bakong_subscription` renewal branch |
| **Impact** | Migration 0002 fails to apply |
| **Likelihood** | Certain (present in v3.1 source) |
| **Mitigation** | Fixed in v3.1.1: `END.` → `END;` |
| **Owner Decision Required** | NO — mechanical fix |
| **Test Coverage** | N/A (static analysis) |
| **v3.1.1 Change** | **FIXED in v3.1.1** |

---

### R20 — False Defect Claims from Review
| Field | Value |
|---|---|
| **Severity** | **LOW** |
| **Category** | Process |
| **Description** | Independent review reported 6 defect areas; 5 were invalid upon source verification |
| **Impact** | Unnecessary rework if acted upon without verification |
| **Likelihood** | N/A (already occurred) |
| **Mitigation** | Documented in v3.1.1; each false claim traced to specific source misunderstanding |
| **Owner Decision Required** | NO |
| **v3.1.1 Change** | **NEW in v3.1.1** — risk of relying on unverified review output |

---

## Risk Summary

| Severity | Count | Items |
|---|---|---|
| **CRITICAL** | 0 | — |
| **HIGH** | 5 | R1, R2, R3, R11, R18 |
| **MEDIUM** | 4 | R4, R5, R12, R15 |
| **LOW** | 9 | R6, R7, R8, R10, R13, R14, R16, R17, R19, R20 |

**Total: 20 risks — 5 HIGH require Project Owner decisions before Migration 0002**

---

## Risk Acceptance Criteria

| Risk | Must Resolve Before |
|---|---|
| R1, R2, R3, R11, R18 | Migration 0002 execution |
| R4 | Preflight validation |
| R12 | Launch |
| R5, R6, R7, R8, R10, R13, R14, R15, R16, R17, R19, R20 | Acceptable with monitoring |

---

**End of Risk Register v3.1.1**