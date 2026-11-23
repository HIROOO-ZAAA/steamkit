# StreamKit v3.1.1 — Acceptance Matrix

**Design Only — No Implementation Authorized**  
Maps every Phase 0.11 requirement/defect to blueprint, migration, test, and verification.

---

## 1. Requirement Traceability (C1–C12 from Phase 0.11 Assignment)

| # | Phase 0.11 Requirement / Defect | Blueprint Section | Migration SQL / Function | Staging Test ID | Verification Evidence | v3.1.1 Status |
|---|---|---|---|---|---|---|
| **C1** | Immutable billing-period ledger; no circular FK; history preserved | §3.1–3.9 | 0001: `subscription_billing_periods` table, `ON DELETE RESTRICT`; `subscriptions.current_period_id` FK | T69, T70, T23, T26, T27 | Schema: period_sequence unique per subscription; FK RESTRICT; payments reference immutable period PK | **PARTIAL** — schema complete, needs staging FK stress test |
| **C2** | Preserve live `streamkit_complete_bakong_payment` exactly (no rename) | §4.1–4.4 | 0002: DO block pre-check; NO RENAME; new `streamkit_complete_bakong_subscription` | T01, T02, T03, T04, T05 | Preflight 2.1–2.5: byte-for-byte live function definition match; grants preserved | **NOT VERIFIED** — requires live preflight execution |
| **C3** | Single subscription identity: checkout creates PENDING, completion ACTIVATES | §5.1–5.3 | 0001: `subscriptions` created with status=pending, current_period_id=NULL; 0002: atomic completion RPC | T06, T12, T13, T14, T15, T16 | Checkout creates sub+period+payment; completion updates all three in one transaction; duplicate callback returns original | **PARTIAL** — logic complete, needs atomic transaction test |
| **C4** | Typed `payment_class` column with 10+ authoritative fields | §6.1–6.5 | 0001: 12 new columns on payment_transactions; CHECK constraints | T62, T67, T68, T70, T71, T72 | Schema: all columns NOT NULL where required; CHECK constraints; unique indexes; metadata non-authoritative | **PARTIAL** — schema complete, needs NULL/CHECK constraint tests |
| **C5** | Complete verified payment record; 3-layer duplicate prevention | §7.1–7.3 | 0002: completion RPC with 3-layer logic; global unique indexes | T16, T24, T25, T70, T71, T72 | RPC code: explicit IS NULL checks; global unique index on provider_hash; period paid check | **PARTIAL** — logic complete, needs duplicate callback staging tests |
| **C6** | UUID-based checkout idempotency (no HMAC/secret) | §8.1–8.4 | 0001: uuid column + unique index; 0002: UUID generation + EXCEPTION handler | T07, T08, T09, T10, T11, T71 | UUID generation; unique index; unique_violation re-SELECT; no secret GUC | **CORRECT** — WHERE clause filters pending/processing; expired/failed don't block |
| **C7** | Late-Payment policy (Quarantine) | §9.1–9.6 | 0001: period status `review_required`; 0002: completion RPC sets quarantine | T24, T25 | RPC: period status IN ('failed','expired','review_required') → quarantine via RETURN (state commits) | **CORRECT** — uses RETURN, not RAISE; durable quarantine confirmed |
| **C8** | Migration safety: idempotent ops, pre-validation, rollback | §10.1–10.4 | 0000: validation DO block; 0001: DO blocks/DROP+CREATE; rollback order | T52, T53, T54, T55, T56, T57 | 0000 fails fast; 0001 runs twice clean; rollback reverse order documented | **PARTIAL** — SQL complete, needs rollback staging test |
| **C9** | SECURITY DEFINER caller identity: auth.uid() / service-role | §§3.2,5.2,8.2 | 0002: all RPCs SECURITY DEFINER, search_path=''; grants to service_role only for privileged | T49, T50, T51 | Function definitions: SECURITY DEFINER, search_path='', REVOKE from PUBLIC/anon/authenticated | **PARTIAL** — grants correct, needs RLS bypass verification |
| **C10** | Provider-specific renewal: separate ABA/Bakong paths | §5.2 (renewal) | 0002: Bakong-only subscription RPC; live ABA donation preserved | T12, T48 | Completion RPC validates payment_class + payment_provider | **PARTIAL** — Bakong complete, ABA subscription correctly excluded |
| **C11** | Duplicate renewal prevention: unique indexes | §6.2, 6.5 | 0001: `payment_transactions_pending_renewal_unique`; global bakong hash unique | T26, T27, T70, T72 | Unique indexes created; test T26/T27 verify prevention; explicit IF EXISTS guard in renewal creation | **CORRECT** — guard + advisory lock + unique index all present |
| **C12** | Authoritative identity: payment_transactions.subscriber_id from auth.uid() | §6.3, 6.5 | 0001: subscriber_id column; 0002: checkout sets from auth.uid(); completion validates match | T06, T20, T49 | Checkout RPC: subscriber_id from auth.uid(); completion validates match; metadata never used for identity | **PARTIAL** — logic complete, needs auth bypass test |

---

## 2. Status Summary

| Status | Count | Items |
|---|---|---|
| **PASS** | 0 | — |
| **PARTIAL** | 9 | C1, C2, C3, C4, C5, C8, C9, C10, C12 (design complete, staging pending) |
| **CORRECT** | 3 | C6, C7, C11 (design verified against false review claims) |
| **FAIL** | 0 | — |
| **NOT VERIFIED** | 1 | C2 (requires live preflight execution) |

**All 12 corrections addressed in design. Zero PASS until staging tests execute.**

---

## 3. Cross-Reference: Document → Requirement

| Document | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Blueprint v3.1.1 | §3 | §4 | §5 | §6 | §7 | §8 | §9 | §10 | §3.2,5.2,8.2 | §5.2 | §6.2,6.5 | §6.3,6.5 |
| Migration SQL | 0001,0002 | 0002 | 0001,0002 | 0001,0002 | 0002 | 0001,0002 | 0001,0002 | 0000–0003 | 0002 | 0002 | 0001,0002 | 0001,0002 |
| Preflight SQL | — | §2 | — | — | — | — | — | §1,§9 | §8 | — | — | — |
| Test Plan | T69,T70,T23,T26,T27 | T01–T05 | T06,T12–T16 | T62,T67,T68,T70–T72 | T16,T24,T25,T70–T72 | T07–T11,T71 | T24,T25 | T52–T57 | T49–T51 | T12,T48 | T26,T27,T70,T72 | T06,T20,T49 |
| Risk Register | R6 | — | — | R8 | R17 | R9(eliminated) | **R11 CONFIRMED** | R5,R15 | — | — | R10 | — |
| Decisions Required | — | — | — | — | — | — | **Decision 2 CONFIRMED** | — | **Decision 1** | — | — | — |
| Changelog | C1 | C2 | C3 | C4 | C5 | C6 | C7 | — | — | — | — | — |

---

## 4. Verification Evidence Requirements (Per Requirement)

| Requirement | Evidence Needed for PASS |
|---|---|
| C1 | Staging: FK RESTRICT blocks subscription delete with periods; period_sequence unique; payment history intact after 3 renewals |
| C2 | Preflight: live `streamkit_complete_bakong_payment` definition byte-for-byte matches Phase A; grants identical; webhook still calls it |
| C3 | Staging: checkout → pending sub+period+payment; webhook completion → active sub, paid period, successful payment (single transaction) |
| C4 | Staging: all 12 columns enforce CHECK/NOT NULL; metadata never read for identity fields |
| C5 | Staging: repeated callback returns original; conflicting hash rejected; period paid rejects second |
| C6 | Staging: 50 concurrent checkout requests → 1 payment created, 49 get unique_violation and re-SELECT same payment_id; expired/failed payments allow new checkout |
| C7 | Staging: expired period + late payment → review_required (state commits via RETURN); manual approve/reject/new-period works |
| C8 | Staging: 0000 fails on incompatible schema; 0001 runs twice clean; rollback restores pre-migration state |
| C9 | Staging: authenticated user cannot call service_role functions; RLS blocks unauthorized SELECT |
| C10 | Staging: ABA donation webhook works; Bakong subscription webhook works; no cross-contamination |
| C11 | Staging: concurrent renewal requests → sequential periods, only first completion succeeds; IF EXISTS guard prevents duplicate period creation |
| C12 | Staging: checkout with spoofed metadata still gets auth.uid() as subscriber_id; completion validates match |

---

**End of Acceptance Matrix v3.1.1**