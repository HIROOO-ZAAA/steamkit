# StreamKit v3.1.1 — Staging Test Plan (72 Executable Specs)

**Design Only — No Implementation Authorized**  
**Environment:** Staging (restored from production)  
**Prerequisites:** Migration 0000-0003 applied, preflight passed, is_platform_admin() implemented, pg_cron scheduled  
**IDENTICAL to v3.1 — no changes required**

---

## Test Categories Overview

| Category | Tests | Focus |
|---|---|---|
| **T01–T05** | Bakong Donation Parity | Live donation RPC unchanged |
| **T06–T11** | Subscription Checkout | Initial flow, idempotency, concurrency |
| **T12–T16** | Initial Completion | Atomic activation, verification, duplicates |
| **T17–T27** | Renewal | Payment creation, completion, sequences |
| **T28–T35** | Cancellation | User, admin, system paths |
| **T36–T43** | Scheduler | Process cancellations, expire due |
| **T44–T48** | Preservation | ABA donation, Bakong donation, routes |
| **T49–T51** | Security | Auth, RLS, authorization |
| **T52–T57** | Migration | Idempotency, rollback, tracking |
| **T58–T61** | RLS/Visibility | Creator, subscriber, admin views |
| **T62–T72** | Constraints | Unique indexes, FK, CHECK |

---

## T01–T05: Bakong Donation Parity (Preservation)

### T01: Live donation function signature unchanged
```sql
-- EXPECTED: streamkit_complete_bakong_payment exists with exact signature
SELECT proname, pg_get_function_identity_arguments(oid) AS args, prorettype::regtype AS returns
FROM pg_proc WHERE proname = 'streamkit_complete_bakong_payment';
-- Args: p_payment_id uuid, p_provider_hash text, p_verified_amount numeric, p_verified_currency text, p_verified_account_id text, p_expected_account_id text, p_provider_paid_at timestamptz
-- Returns: jsonb
```

### T02: Live donation function body unchanged
```sql
-- EXPECTED: Definition matches Phase A live evidence exactly
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'streamkit_complete_bakong_payment';
-- Compare byte-for-byte with saved Phase A definition
```

### T03: Donation webhook still works
```sql
-- Setup: Create pending donation payment
INSERT INTO payment_transactions (id, creator_id, donor_name, amount, currency, payment_provider, payment_class, status, expires_at)
VALUES (gen_random_uuid(), 'creator-uuid', 'Donor', 5.00, 'USD', 'bakong', 'donation', 'pending', now() + interval '5 min');

-- Call: streamkit_complete_bakong_payment with valid params
-- EXPECTED: payment.status = 'successful', donation row created, tip row created (if applicable)
-- Verify: Donation RPC behavior identical to pre-migration
```

### T04: Donation status route still works
```sql
-- GET /api/payments/status?payment_id=... for donation
-- EXPECTED: Calls streamkit_complete_bakong_payment, returns success
```

### T05: ABA donation RPC unchanged
```sql
-- Verify streamkit_complete_aba_payment definition unchanged
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'streamkit_complete_aba_payment';
-- Returns: jsonb (not void!)
```

---

## T06–T11: Subscription Checkout

### T06: Authenticated checkout creates subscription + period + payment
```sql
-- CALL: streamkit_create_bakong_subscription_payment(tier_id)
-- EXPECTED: Returns {payment_id, expires_at, amount, currency, idempotent: false}
-- VERIFY:
SELECT * FROM subscriptions WHERE id = (SELECT subscription_id FROM payment_transactions WHERE id = payment_id);
-- status = 'pending', current_period_id IS NULL
SELECT * FROM subscription_billing_periods WHERE subscription_id = subscriptions.id;
-- period_sequence = 1, status = 'pending'
SELECT * FROM payment_transactions WHERE id = payment_id;
-- payment_class = 'subscription_new', checkout_intent_key IS NOT NULL, subscriber_id = auth.uid()
```

### T07: Repeated checkout returns same payment (idempotent)
```sql
-- CALL: streamkit_create_bakong_subscription_payment(tier_id) twice with same session
-- EXPECTED: Second call returns idempotent: true, SAME payment_id
-- VERIFY: checkout_intent_key matches, only 1 row in payment_transactions
```

### T08: Concurrent checkout requests (race condition)
```sql
-- PARALLEL: 5 simultaneous calls to streamkit_create_bakong_subscription_payment(tier_id)
-- EXPECTED: Exactly 1 succeeds, 4 get unique_violation and re-SELECT same payment_id
-- VERIFY: Only 1 subscription, 1 period, 1 payment created
```

### T09: Expired payment allows new checkout
```sql
-- 1. Create checkout (payment expires in 5 min)
-- 2. Wait for expiry (or set expires_at = now() - interval '1 min')
-- 3. CALL checkout again
-- EXPECTED: New payment_id, new checkout_intent_key, new subscription intent
```

### T10: Failed payment allows new checkout
```sql
-- 1. Create checkout
-- 2. Manually set payment.status = 'failed'
-- 3. CALL checkout again
-- EXPECTED: New payment created, new intent key = new intent
```

### T11: Checkout blocked by existing active subscription
```sql
-- 1. Complete subscription (status=active)
-- 2. CALL checkout for same tier
-- EXPECTED: RAISE EXCEPTION 'Already subscribed to this tier'
```

---

## T12–T16: Initial Completion (Atomic)

### T12: Valid completion activates subscription
```sql
-- Setup: Checkout created (pending subscription, pending period, pending payment)
-- CALL: streamkit_complete_bakong_subscription(payment_id, valid_hash, amount, currency, account, expected_account, paid_at)
-- EXPECTED: Returns {status: 'successful', subscription_id, billing_period_id, period_sequence: 1}
-- VERIFY:
-- payment.status = 'successful', provider_hash set, verified_at set
-- period.status = 'paid', paid_at = provider_paid_at, payment_id = payment.id
-- subscription.status = 'active', current_period_id = period.id, current_period_start/end = period
```

### T13: Completion validates Bakong window (created_at - 1min to expires_at)
```sql
-- Test 1: paid_at < created_at - 1min → RAISE 'Provider payment time outside valid window'
-- Test 2: paid_at > expires_at → RAISE 'Provider payment time outside valid window'
-- Test 3: paid_at in [created_at - 1min, expires_at] → SUCCESS
```

### T14: Completion rejects missing verified fields
```sql
-- CALL with p_verified_amount = NULL → RAISE 'Required verification fields missing'
-- CALL with p_verified_currency = NULL → RAISE 'Required verification fields missing'
-- CALL with p_provider_paid_at = NULL → RAISE 'Required verification fields missing'
```

### T15: Completion validates amount/currency against PERIOD (not current tier)
```sql
-- Setup: Tier price $10, checkout created
-- Manually update tier price to $15 (simulating price change during QR window)
-- CALL completion with amount=$10 (original)
-- EXPECTED: SUCCESS (period stores authoritative $10)
-- CALL completion with amount=$15 → RAISE 'Amount/currency mismatch with billing period'
```

### T16: Repeated identical callback returns original result (Layer 1 duplicate)
```sql
-- 1. Complete payment successfully
-- 2. CALL completion again with SAME params
-- EXPECTED: Returns original result immediately, NO changes to any table
-- VERIFY: Row counts unchanged, no duplicate rows
```

---

## T17–T27: Renewal

### T17: Renewal payment creation (service-role only)
```sql
-- CALL: streamkit_create_bakong_renewal_payment(subscription_id) as service_role
-- EXPECTED: Returns {payment_id, expires_at, amount, currency}
-- VERIFY:
-- New period created with period_sequence = 2, period_start = sub.current_period_end
-- New payment: payment_class = 'subscription_renewal', billing_period_id = new period
```

### T18: Renewal blocked for non-Bakong subscription
```sql
-- Setup: subscription.payment_provider = 'aba_payway'
-- CALL renewal → RAISE 'Not a Bakong subscription'
```

### T19: Renewal blocked for inactive subscription
```sql
-- Setup: subscription.status = 'cancelled' or 'expired'
-- CALL renewal → RAISE 'Not eligible for renewal'
```

### T20: Renewal payment completion advances subscription
```sql
-- Setup: Active subscription, renewal payment created, period 2 pending
-- CALL: streamkit_complete_bakong_subscription for renewal payment
-- EXPECTED:
-- period_2.status = 'paid'
-- subscription.current_period_id = period_2.id
-- subscription.current_period_start/end = period_2
-- subscription.cancel_at_period_end = FALSE
-- subscription.last_payment_id = renewal_payment.id
```

### T21: Renewal clears cancel_at_period_end
```sql
-- Setup: subscription.cancel_at_period_end = true
-- Complete renewal
-- EXPECTED: subscription.cancel_at_period_end = false
```

### T22: Renewal from past_due restores active
```sql
-- Setup: subscription.status = 'past_due'
-- Complete renewal
-- EXPECTED: subscription.status = 'active'
```

### T23: Renewal validates period sequence (no gaps)
```sql
-- Setup: Period 1 paid, period 2 pending
-- Manually insert period 3 (sequence=3)
-- CALL renewal for period 2
-- EXPECTED: SUCCESS
-- CALL completion for period 2
-- EXPECTED: SUCCESS
-- Try to complete period 3 without period 2 → sequence mismatch error
```

### T24: Late payment on expired period → quarantine (C7)
```sql
-- Setup: Period status = 'expired' (QR expired, no payment)
-- CALL completion with valid provider data but late
-- EXPECTED: period.status = 'review_required', RAISE 'Billing period requires manual review'
-- VERIFY: payment NOT marked successful, subscription NOT advanced
```

### T25: Late payment on failed period → quarantine (C7)
```sql
-- Setup: Period status = 'failed' (provider rejected)
-- CALL completion with valid provider data
-- EXPECTED: period.status = 'review_required', RAISE 'Billing period requires manual review'
```

### T26: Duplicate renewal prevented by unique index (C5)
```sql
-- 1. Create renewal payment for period 2
-- 2. Try to create another renewal for same subscription (race)
-- EXPECTED: Second INSERT fails with unique_violation on payment_transactions_pending_renewal_unique
```

### T27: Concurrent renewal payments (race condition)
```sql
-- PARALLEL: 2 calls to streamkit_create_bakong_renewal_payment for same subscription
-- EXPECTED: get_next_period_sequence uses LOCK TABLE → sequential sequences (2, 3)
-- Both payments created, each linked to different period
-- Only first completion succeeds, second hits 'Billing period already paid' or sequence mismatch
```

---

## T28–T35: Cancellation

### T28: Creator schedules cancellation
```sql
-- CALL: streamkit_cancel_subscription_user(sub_id) as creator
-- EXPECTED: cancel_at_period_end = true, returns period_end
-- VERIFY: subscription.status unchanged (still active)
```

### T29: Unauthorized user cannot cancel
```sql
-- CALL: streamkit_cancel_subscription_user(sub_id) as random user
-- EXPECTED: RAISE 'Only creator may schedule cancellation'
```

### T30: Already scheduled cancellation returns current state
```sql
-- CALL cancel when cancel_at_period_end = true
-- EXPECTED: Returns {already_scheduled: true}, no changes
```

### T31: Admin cancels immediately (deferred)
```sql
-- CALL: streamkit_cancel_subscription_admin(sub_id) as platform_admin
-- EXPECTED: status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false
```

### T32: Non-admin cannot call admin cancellation
```sql
-- CALL admin function as regular user → RAISE 'Platform admin required'
```

### T33: System cancellation processes scheduled subs
```sql
-- Setup: subscription.cancel_at_period_end = true, current_period_end < now()
-- CALL: streamkit_cancel_subscription_system(sub_id) as service_role
-- EXPECTED: status = 'cancelled', cancelled_at = now()
```

### T34: System cancellation rejects unscheduled
```sql
-- Setup: cancel_at_period_end = false
-- CALL system function → RAISE 'Not scheduled for cancellation'
```

### T35: Subscriber self-cancellation blocked (BY DESIGN)
```sql
-- CALL: streamkit_cancel_subscription_user(sub_id) as subscriber
-- EXPECTED: RAISE 'Only creator may schedule cancellation'
-- NOTE: This is by design — subscriber-initiated NOT approved for launch
```

---

## T36–T43: Scheduler

### T36: process_cancellations processes batch
```sql
-- Setup: 5 subscriptions with cancel_at_period_end=true, period_end < now()
-- CALL: streamkit_process_cancellations(3)
-- EXPECTED: Returns 3, 3 subscriptions cancelled
-- CALL again: Returns 2, total 5 cancelled
```

### T37: process_cancellations skips locked rows
```sql
-- Setup: Session 1: BEGIN; SELECT * FROM subscriptions WHERE id = X FOR UPDATE;
-- Session 2: CALL streamkit_process_cancellations(10)
-- EXPECTED: Session 2 processes other rows, skips X (SKIP LOCKED)
```

### T38: process_cancellations respects batch size
```sql
-- Setup: 100 eligible subscriptions
-- CALL: streamkit_process_cancellations(10)
-- EXPECTED: Returns 10 (not 100)
```

### T39: process_cancellations only affects active/trialing/past_due
```sql
-- Setup: cancelled, expired subs with cancel_at_period_end=true
-- CALL processor
-- EXPECTED: Only active/trialing/past_due updated
```

### T40: expire_due_subscriptions processes past_due with grace
```sql
-- Setup: 3 past_due subs with current_period_end = now() - 8 days
-- CALL: streamkit_expire_due_subscriptions(7)
-- EXPECTED: Returns 3, status = 'expired'
```

### T41: expire_due_subscriptions respects grace period
```sql
-- Setup: past_due sub with current_period_end = now() - 3 days
-- CALL: streamkit_expire_due_subscriptions(7)
-- EXPECTED: Returns 0 (within grace)
```

### T42: expire_due_subscriptions validates grace bounds
```sql
-- CALL with -1 → RAISE 'Invalid grace period'
-- CALL with 366 → RAISE 'Invalid grace period'
```

### T43: Scheduler integration (pg_cron)
```sql
-- Verify: SELECT * FROM cron.job WHERE command LIKE '%streamkit_process_cancellations%'
-- EXPECTED: Job exists, schedule = '1 minute' (or configured)
```

---

## T44–T48: Preservation

### T44: ABA donation webhook works post-migration
```sql
-- POST /api/payments/webhook (ABA) → calls streamkit_complete_aba_payment
-- EXPECTED: Success, donation created, no subscription tables touched
```

### T45: ABA status route works
```sql
-- GET /api/payments/status for ABA payment
-- EXPECTED: Calls streamkit_complete_aba_payment, returns jsonb
```

### T46: Bakong donation webhook works
```sql
-- POST /api/payments/webhook (Bakong donation) → calls streamkit_complete_bakong_payment
-- EXPECTED: Success, donation created, tip if applicable
```

### T47: Bakong donation status route works
```sql
-- GET /api/payments/status for Bakong donation
-- EXPECTED: Calls streamkit_complete_bakong_payment, returns jsonb
```

### T48: No cross-contamination: subscription completion doesn't call donation RPC
```sql
-- Verify: streamkit_complete_bakong_subscription code does not reference streamkit_complete_bakong_payment
-- EXPECTED: Separate code paths, payment_class + payment_provider enforced
```

---

## T49–T51: Security

### T49: Authenticated user cannot call service_role functions
```sql
-- CALL streamkit_complete_bakong_subscription as authenticated user
-- EXPECTED: Permission denied (granted to service_role only)
```

### T50: RLS blocks unauthorized subscription access
```sql
-- User A: SELECT * FROM subscriptions WHERE creator_id = 'user-b'
-- EXPECTED: 0 rows (RLS: creator views own tier subscriptions only)
```

### T51: Admin function requires is_platform_admin()
```sql
-- CALL streamkit_cancel_subscription_admin as non-admin
-- EXPECTED: RAISE 'Platform admin required'
-- If is_platform_admin() missing → 'Administrative cancellation not available'
```

---

## T52–T57: Migration

### T52: Migration 0000 fails fast on incompatible schema
```sql
-- Setup: donation_id NOT NULL
-- RUN 0000 → RAISE EXCEPTION 'FAIL: donation_id must be nullable'
```

### T53: Migration 0000 validates live donation function
```sql
-- RUN 0000 without live function → RAISE 'Phase A evidence required'
-- RUN 0000 with function → PASS, captures definition
```

### T54: Migration 0001 idempotent (runs twice clean)
```sql
-- RUN 0001, then RUN 0001 again
-- EXPECTED: No errors, no duplicate objects
```

### T55: Migration rollback 0003 restores tier columns
```sql
-- APPLY 0000-0003, then ROLLBACK 0003
-- EXPECTED: tier columns (currency, billing_interval, deleted_at) dropped if added by 0003
```

### T56: Migration rollback 0002 drops subscription RPCs only
```sql
-- APPLY 0000-0003, then ROLLBACK 0002
-- EXPECTED: All 13 new RPCs dropped, streamkit_complete_bakong_payment PRESERVED
```

### T57: Migration rollback 0001 drops subscription tables
```sql
-- APPLY 0000-0003, then ROLLBACK 0001
-- EXPECTED: subscription_billing_periods, subscriptions dropped; payment_transactions columns removed
```

---

## T58–T61: RLS/Visibility

### T58: Creator views own tier subscriptions
```sql
-- As creator: SELECT * FROM subscriptions WHERE tier_id IN (SELECT id FROM subscription_tiers WHERE user_id = auth.uid())
-- EXPECTED: Returns creator's tier subscriptions
```

### T59: Subscriber views own subscriptions
```sql
-- As subscriber: SELECT * FROM subscriptions WHERE user_id = auth.uid()
-- EXPECTED: Returns subscriber's subscriptions
```

### T60: Creator views own subscription periods
```sql
-- As creator: SELECT * FROM subscription_billing_periods WHERE subscription_id IN (SELECT id FROM subscriptions WHERE creator_id = auth.uid())
-- EXPECTED: Returns periods for creator's tiers
```

### T61: Subscriber views own subscription periods
```sql
-- As subscriber: SELECT * FROM subscription_billing_periods WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = auth.uid())
-- EXPECTED: Returns subscriber's periods
```

---

## T62–T72: Constraints

### T62: payment_transactions.payment_class CHECK
```sql
-- INSERT with payment_class = 'invalid' → RAISE CHECK violation
```

### T63: payment_transactions.verified_currency CHECK
```sql
-- INSERT with verified_currency = 'EUR' → RAISE CHECK violation
```

### T64: subscription_billing_periods.tier_currency CHECK
```sql
-- INSERT with tier_currency = 'EUR' → RAISE CHECK violation
```

### T65: subscription_billing_periods.status CHECK
```sql
-- INSERT with status = 'invalid' → RAISE CHECK violation
```

### T66: subscriptions.current_period_id FK SET NULL
```sql
-- DELETE period referenced by subscription.current_period_id
-- EXPECTED: current_period_id set to NULL (not cascade delete)
```

### T67: subscription_billing_periods.sbp_unique_seq
```sql
-- INSERT two periods with same subscription_id + period_sequence → unique_violation
```

### T68: subscription_unique_active_tier_user
```sql
-- Create active subscription for tier A + user X, then try again → unique_violation
```

### T69: payment_transactions_bakong_hash_global_unique
```sql
-- Complete payment with hash H, then try another payment with same hash → unique_violation
```

### T70: payment_transactions_checkout_intent_unique (pending/processing only)
```sql
-- 1. Create checkout (status=pending) with intent K
-- 2. Try second checkout with same K → unique_violation
-- 3. Update first to status=successful, try again with K → SUCCESS (index doesn't cover successful)
```

### T71: payment_transactions_pending_renewal_unique
```sql
-- 1. Create renewal payment for sub X + period Y
-- 2. Try second renewal for same sub X + period Y → unique_violation
```

### T72: subscriptions_no_self_sub
```sql
-- INSERT subscription where user_id = creator_id → CHECK violation
```

---

**End of Staging Test Plan v3.1.1**