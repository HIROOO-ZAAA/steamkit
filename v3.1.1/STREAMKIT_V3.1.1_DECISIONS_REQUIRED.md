# StreamKit v3.1.1 — Project Owner Decisions Required

**Design Only — No Implementation Authorized**  
**Updated from v3.1 with defect analysis corrections**

---

## Decisions Required BEFORE Migration 0002

These must be resolved before applying migration 0002 (which creates subscription RPCs).

---

### Decision 1: Platform Admin Authorization Model
**Blocking:** Migration 0002 references `public.is_platform_admin(uuid)` which may not exist.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Verify existing admin function** | Use existing `is_platform_admin()` if present | Immediate, no changes | May not exist |
| **B. Create minimal admin function** | Simple `profiles.role='admin'` check if column exists | Simple, works if profile exists | Relies on profile schema |
| **C. Graceful degradation** | Admin function raises clear exception if auth missing | No blocking, clear message | Admin cancellation deferred |
| **D. Separate admin module (Phase 1)** | Create full admin auth in Phase 1 | Clean separation | Requires separate implementation |

**Recommendation:** Option C (graceful degradation) — most aligned with v3.1 constraints.

**Decision needed:** Select option → implement before 0002

---

### Decision 2: Late Payment Policy (C7) — **CONFIRMED in v3.1**
**Blocking:** v3.1 implements quarantine (Option C) — must confirm this is approved.

| Option | Behavior | Revenue Impact | User Experience |
|---|---|---|---|
| **A. Grace Extension (v3.0)** | Late payments allowed for same period if not advanced | Revenue recognized in original period | User pays late, subscription continues |
| **B. New Period Only** | Late payments always create new period | Revenue recognized in new period | Clear period boundaries; user sees gap |
| **C. Quarantine (v3.1 / v3.1.1)** | Late payments → `review_required`, manual resolution | Delayed recognition | Human review, slower |

**Recommendation:** Option C (v3.1 implements this)  
**Decision needed:** Confirm quarantine policy or select alternative

**v3.1.1 Update:** **CONFIRMED** — source verification shows quarantine implemented correctly with `RETURN` (not `RAISE`), state commits durably.

---

### Decision 3: Scheduler Deployment Method
**Blocking:** Cancellation/expiration processors need scheduling.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. pg_cron** | PostgreSQL extension; `SELECT cron.schedule('1 minute', 'SELECT streamkit_process_cancellations()');` | Native, reliable, transactional | Requires pg_cron extension enabled |
| **B. External Scheduler** | CI/CD, external service calls RPC | Flexible, no DB dependency | External dependency, auth management |

**Recommendation:** Option A (pg_cron) if available  
**Decision needed:** Confirm infrastructure choice

---

## Decisions Required BEFORE Launch

These can be resolved after migration but before production traffic.

---

### Decision 4: Trial Period Support
**Scope:** `subscriptions.trial_end` column exists but no trial logic implemented.

| Option | Description |
|---|---|
| **A. Implement trial logic now** | Full trial system: `status='trialing'`, validation, `trialing→active` transition |
| **B. Defer to Phase 1** | Column remains unused; out of Phase 0 scope |

**Recommendation:** Option B (defer to Phase 1)  
**Decision needed:** Confirm deferral

---

### Decision 5: Refund Handling
**Scope:** No subscription refund RPC; donation refund may not apply.

| Option | Description |
|---|---|
| **A. New RPC** | Create `streamkit_refund_subscription_payment` with pro-rata logic |
| **B. Reuse donation refund** | Adapt existing donation refund for subscriptions |
| **C. Manual only** | Phase 0: manual refunds; automate in Phase 1 |

**Recommendation:** Option C (Phase 1)  
**Decision needed:** Confirm deferral

---

## Decision Tracking

| # | Decision | v3.1 Status | v3.1.1 Status | Owner | Deadline | v3.1.1 Change |
|---|---|---|---|---|---|---|
| 1 | Platform admin model | **PENDING** | **PENDING** | Project Owner | Before 0002 | **Same — graceful degradation** |
| 2 | Late payment policy | **PENDING** (Option C in v3.1) | **CONFIRMED** | Project Owner | Before 0002 | **CHANGED: quarantine verified in source** |
| 3 | Scheduler deployment | **PENDING** | **PENDING** | Project Owner | Before launch | **Same** |
| 4 | Trial period | **PENDING** (Option B recommended) | **PENDING** | Project Owner | Before launch | **Same** |
| 5 | Refund handling | **PENDING** (Option C recommended) | **PENDING** | Project Owner | Phase 1 | **Same** |

---

## Impact of Deferral

| Deferred Decision | Consequence |
|---|---|
| Decision 1 | Migration 0002 **will fail** if no admin auth found — uses graceful degradation |
| Decision 2 | v3.1.1 implements Option C (quarantine); changing requires RPC modification post-migration |
| Decision 3 | Processors exist but **will not run** — subscriptions never cancelled/expired without scheduler |
| Decision 4 | `trial_end` column unused; no trial subscriptions possible |
| Decision 5 | No automated refunds; manual process required |

---

## Resolution Process

1. Project Owner reviews options
2. Decision recorded in this document
3. If code change needed (Decision 1), implement before migration
4. If policy only (Decisions 2, 4, 5), document choice
5. Update v3.1.1 blueprint if behavior changes
6. Re-run staging tests after any change

---

## v3.1.1 Decision Delta from v3.1

| Decision | v3.1 Default | v3.1.1 Default | Reason |
|---|---|---|---|
| 2. Late Payment | Option C: Quarantine | **Option C: Quarantine — CONFIRMED** | **Source verification confirmed durable implementation** |

**All other decisions unchanged from v3.1.**

---

**End of Decisions Required v3.1.1**