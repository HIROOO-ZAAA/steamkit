# StreamKit v3.1.1 — Complete Migration SQL (4 Files)

**Design Only — No Implementation Authorized**  
**Execute in order: 0000 → 0001 → 0002 → 0003**  
**Rollback in reverse: 0003 → 0002 → 0001**

---

## v3.1 → v3.1.1 Changes

**Single character fix in migration 0002:**
- File: `0002_bakong_subscription_rpcs.sql`
- Function: `streamkit_complete_bakong_subscription`
- Location: Renewal branch, CASE expression assignment
- Fix: `END.` → `END;`

All other SQL identical to v3.1.

---

## 0000_pre_migration_validation.sql

```sql
-- 0000_pre_migration_validation.sql
-- Run FIRST — FAIL FAST if schema incompatible
-- Must pass before ANY other migration runs

DO $$
DECLARE
    v_donation_id_nullable text;
    v_provider_enum_exists boolean;
    v_tier_billing_interval_exists boolean;
    v_tier_currency_exists boolean;
    v_tier_deleted_at_exists boolean;
    v_existing_subscriptions boolean;
    v_current_period_id_exists boolean;
    v_payment_class_exists boolean;
    v_payment_provider_exists boolean;
    v_live_donation_function jsonb;
BEGIN
    -- 1. payment_transactions.donation_id must be nullable (subscriptions use NULL)
    SELECT is_nullable INTO v_donation_id_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'donation_id';
    IF v_donation_id_nullable <> 'YES' THEN
        RAISE EXCEPTION 'FAIL: payment_transactions.donation_id must be nullable for subscription payments (donation_id=NULL). Current: %', v_donation_id_nullable;
    END IF;
    RAISE NOTICE 'PASS: donation_id is nullable';

    -- 2. payment_provider enum has 'bakong'
    SELECT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'payment_provider' AND e.enumlabel = 'bakong'
    ) INTO v_provider_enum_exists;
    IF NOT v_provider_enum_exists THEN
        RAISE EXCEPTION 'FAIL: payment_provider enum missing bakong value';
    END IF;
    RAISE NOTICE 'PASS: payment_provider enum has bakong';

    -- 3. subscription_tiers exists and has required columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='subscription_tiers'
    ) THEN
        RAISE EXCEPTION 'FAIL: subscription_tiers table does not exist';
    END IF;
    RAISE NOTICE 'PASS: subscription_tiers table exists';

    -- Check if tier columns exist (they may be added by migration 0001 itself)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='billing_interval'
    ) INTO v_tier_billing_interval_exists;
    RAISE NOTICE 'INFO: subscription_tiers.billing_interval exists: % (migration 0001 will add if missing)', v_tier_billing_interval_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='currency'
    ) INTO v_tier_currency_exists;
    RAISE NOTICE 'INFO: subscription_tiers.currency exists: % (migration 0001 will add if missing)', v_tier_currency_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='deleted_at'
    ) INTO v_tier_deleted_at_exists;
    RAISE NOTICE 'INFO: subscription_tiers.deleted_at exists: % (migration 0001 will add if missing)', v_tier_deleted_at_exists;

    -- 4. Existing subscriptions table compatibility
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='subscriptions'
    ) INTO v_existing_subscriptions;
    
    IF v_existing_subscriptions THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema='public' AND table_name='subscriptions' AND column_name='current_period_id'
        ) INTO v_current_period_id_exists;
        IF NOT v_current_period_id_exists THEN
            RAISE EXCEPTION 'FAIL: subscriptions table exists but missing current_period_id — manual reconciliation required';
        END IF;
        RAISE NOTICE 'PASS: existing subscriptions table has current_period_id';
    ELSE
        RAISE NOTICE 'PASS: no existing subscriptions table (clean install)';
    END IF;

    -- 5. Check existing payment_transactions columns (schema-first)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='payment_class'
    ) INTO v_payment_class_exists;
    RAISE NOTICE 'INFO: payment_transactions.payment_class exists: %', v_payment_class_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='payment_provider'
    ) INTO v_payment_provider_exists;
    RAISE NOTICE 'INFO: payment_transactions.payment_provider exists: %', v_payment_provider_exists;

    -- 6. Live donation function exists and capture full evidence
    SELECT jsonb_build_object(
        'name', p.proname,
        'definition', pg_get_functiondef(p.oid),
        'security_definer', p.prosecdef,
        'search_path', p.proconfig,
        'owner', rolname,
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'volatile', p.provolatile
    ) INTO v_live_donation_function
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_roles r ON p.proowner = r.oid
    WHERE n.nspname = 'public' AND p.proname = 'streamkit_complete_bakong_payment';
    
    IF v_live_donation_function IS NULL THEN
        RAISE EXCEPTION 'FAIL: Live streamkit_complete_bakong_payment not found — Phase A evidence required';
    END IF;
    
    -- Log captured evidence for comparison
    RAISE NOTICE 'CAPTURED LIVE DONATION FUNCTION: %', v_live_donation_function;
    RAISE NOTICE 'PASS: Live streamkit_complete_bakong_payment exists';

    -- 7. Capture donation function ACL
    IF EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'streamkit_complete_bakong_payment'
    ) THEN
        RAISE NOTICE 'PASS: Donation function ACL captured';
    ELSE
        RAISE NOTICE 'WARN: Donation function has no explicit grants';
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'ALL PRE-MIGRATION VALIDATIONS PASSED';
    RAISE NOTICE 'Safe to proceed with 0001';
    RAISE NOTICE '========================================';
END $$;
```

---

## 0001_subscription_core_and_ledger.sql

```sql
-- 0001_subscription_core_and_ledger.sql
-- Core schema, billing-period ledger, RLS, indexes
-- Depends on: 0000 validation passed

-- ============================================================
-- 1. ENUMS (idempotent DO blocks)
-- ============================================================
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('pending','trialing','active','past_due','cancelled','expired','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_provider AS ENUM ('bakong','aba_payway'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE billing_interval AS ENUM ('monthly','quarterly','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. SUBSCRIPTION_TIERS COLUMNS (before RLS references them)
-- ============================================================
ALTER TABLE public.subscription_tiers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.subscription_tiers ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KHR'));
ALTER TABLE public.subscription_tiers ADD COLUMN IF NOT EXISTS billing_interval billing_interval NOT NULL DEFAULT 'monthly';

-- ============================================================
-- 3. SUBSCRIPTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_id uuid NOT NULL REFERENCES public.subscription_tiers(id) ON DELETE RESTRICT,
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status subscription_status NOT NULL DEFAULT 'pending',
    current_period_start timestamptz NOT NULL DEFAULT now(),
    current_period_end timestamptz NOT NULL,
    current_period_id uuid,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    cancelled_at timestamptz,
    trial_end timestamptz,
    payment_provider payment_provider NOT NULL,
    provider_subscription_id text,
    provider_customer_id text,
    last_payment_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subscriptions_no_self_sub CHECK (user_id <> creator_id)
);

-- ============================================================
-- 4. SUBSCRIPTION_BILLING_PERIODS — IMMUTABLE LEDGER (C1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscription_billing_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    period_sequence integer NOT NULL,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed','review_required')),
    payment_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
    -- Immutable financial snapshot (set at creation, never modified)
    tier_price numeric(10,2) NOT NULL,
    tier_currency text NOT NULL CHECK (tier_currency IN ('USD','KHR')),
    billing_interval billing_interval NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    CONSTRAINT sbp_unique_seq UNIQUE (subscription_id, period_sequence)
);

-- Add FK to subscriptions.current_period_id AFTER periods table exists (C1 fix)
ALTER TABLE public.subscriptions ADD CONSTRAINT fk_subscriptions_current_period
    FOREIGN KEY (current_period_id) REFERENCES public.subscription_billing_periods(id) ON DELETE SET NULL;

-- ============================================================
-- 5. INDEXES
-- ============================================================
-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_sub_creator ON public.subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_sub_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_tier ON public.subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_sub_provider_sub ON public.subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_period_end ON public.subscriptions(current_period_end) WHERE status IN ('active','trialing','past_due');
CREATE INDEX IF NOT EXISTS idx_sub_current_period ON public.subscriptions(current_period_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_unique_active_tier_user ON public.subscriptions(tier_id, user_id) WHERE status IN ('active','trialing','past_due');
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_provider_sub_unique ON public.subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

-- Billing Periods
CREATE INDEX IF NOT EXISTS idx_sbp_subscription ON public.subscription_billing_periods(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sbp_status ON public.subscription_billing_periods(status) WHERE status IN ('pending','paid','review_required');
CREATE INDEX IF NOT EXISTS idx_sbp_payment ON public.subscription_billing_periods(payment_id);

-- ============================================================
-- 6. RLS — SUBSCRIPTIONS
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO service_role;

DROP POLICY IF EXISTS "Creator views own tier subscriptions" ON public.subscriptions;
CREATE POLICY "Creator views own tier subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subscription_tiers st WHERE st.id = subscriptions.tier_id AND st.user_id = auth.uid() AND (st.deleted_at IS NULL OR st.deleted_at > now()))
);
DROP POLICY IF EXISTS "Member views own subscriptions" ON public.subscriptions;
CREATE POLICY "Member views own subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 7. RLS — SUBSCRIPTION_BILLING_PERIODS
-- ============================================================
ALTER TABLE public.subscription_billing_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_billing_periods FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscription_billing_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.subscription_billing_periods TO service_role;

DROP POLICY IF EXISTS "Creator views own subscription periods" ON public.subscription_billing_periods;
CREATE POLICY "Creator views own subscription periods" ON public.subscription_billing_periods FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subscriptions s JOIN public.subscription_tiers st ON s.tier_id = st.id WHERE s.id = subscription_billing_periods.subscription_id AND st.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Subscriber views own subscription periods" ON public.subscription_billing_periods;
CREATE POLICY "Subscriber views own subscription periods" ON public.subscription_billing_periods FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_billing_periods.subscription_id AND s.user_id = auth.uid())
);

-- ============================================================
-- 8. TRIGGER
-- ============================================================
DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. PAYMENT_TRANSACTIONS COLUMNS (C4 — Schema-First, Typed Identity)
-- ============================================================
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS payment_class text NOT NULL DEFAULT 'donation' CHECK (payment_class IN ('donation','subscription_new','subscription_renewal'));
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS billing_period_id uuid REFERENCES public.subscription_billing_periods(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS payment_provider payment_provider;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS provider_hash text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS provider_paid_at timestamptz;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS verified_amount numeric(10,2);
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS verified_currency text CHECK (verified_currency IN ('USD','KHR'));
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS verified_account_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS checkout_intent_key text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS review_reason text;

-- ============================================================
-- 10. UNIQUE INDEXES — DUPLICATE PREVENTION (C5, C6, C11)
-- ============================================================
-- Global Bakong provider hash uniqueness (prevents reuse)
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_bakong_hash_global_unique
    ON public.payment_transactions (provider_hash)
    WHERE payment_provider = 'bakong' AND status = 'successful';

-- Stable checkout intent (deterministic per subscriber+tier, active attempts only)
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_checkout_intent_unique
    ON public.payment_transactions (checkout_intent_key)
    WHERE payment_class IN ('subscription_new','subscription_renewal')
      AND status IN ('pending', 'processing');

-- Duplicate renewal prevention
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_pending_renewal_unique
    ON public.payment_transactions (subscription_id, billing_period_id)
    WHERE payment_class = 'subscription_renewal' AND status IN ('pending','processing');

-- ============================================================
-- 11. TIER RLS
-- ============================================================
DROP POLICY IF EXISTS "Tiers viewable by all" ON public.subscription_tiers;
CREATE POLICY "Tiers viewable by all" ON public.subscription_tiers FOR SELECT TO authenticated USING (deleted_at IS NULL OR deleted_at > now());
DROP POLICY IF EXISTS "Users manage tiers" ON public.subscription_tiers;
CREATE POLICY "Users manage tiers" ON public.subscription_tiers FOR ALL TO authenticated USING (auth.uid() = user_id AND (deleted_at IS NULL OR deleted_at > now()));

-- ============================================================
-- 12. SCHEMA RELOAD
-- ============================================================
NOTIFY pgrst, 'reload schema';
```

---

## 0002_bakong_subscription_rpcs.sql

```sql
-- 0002_bakong_subscription_rpcs.sql
-- Bakong subscription RPCs
-- CRITICAL: NO reference to live streamkit_complete_bakong_payment
-- Depends on: 0001

-- ============================================================
-- PRE-CHECK: Live donation function exists (capture only)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid 
        WHERE n.nspname='public' AND p.proname='streamkit_complete_bakong_payment'
    ) THEN
        RAISE EXCEPTION 'Live streamkit_complete_bakong_payment not found — Phase A evidence required';
    END IF;
    RAISE NOTICE 'Live streamkit_complete_bakong_payment confirmed — will NOT be modified';
END $$;

-- ============================================================
-- 1. STREAMKIT_COMPLETE_BAKONG_SUBSCRIPTION (C3, C5, C7)
-- Atomic completion for BOTH initial and renewal
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_complete_bakong_subscription(
    p_payment_id uuid,
    p_provider_hash text,
    p_verified_amount numeric,
    p_verified_currency text,
    p_verified_account_id text,
    p_expected_account_id text,
    p_provider_paid_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_payment public.payment_transactions%rowtype;
    v_period public.subscription_billing_periods%rowtype;
    v_sub public.subscriptions%rowtype;
    v_tier public.subscription_tiers%rowtype;
    v_interval interval;
    v_is_initial boolean;
BEGIN
    -- 1. Lock payment row
    SELECT * INTO v_payment FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

    -- 2. Validate subscription payment type
    IF v_payment.payment_class NOT IN ('subscription_new', 'subscription_renewal') THEN
        RAISE EXCEPTION 'Not a subscription payment';
    END IF;
    IF v_payment.payment_provider <> 'bakong' THEN
        RAISE EXCEPTION 'Invalid payment provider for this function';
    END IF;
    v_is_initial := (v_payment.payment_class = 'subscription_new');

    -- 3. Hash validation (non-blank, normalized)
    IF p_provider_hash IS NULL OR trim(p_provider_hash) = '' THEN
        RAISE EXCEPTION 'Invalid provider hash';
    END IF;
    p_provider_hash := trim(p_provider_hash);

    -- 4. Layer 1: Same payment already successful — return existing (idempotent)
    IF v_payment.status = 'successful' THEN
        -- Verify incoming evidence matches stored (conflicting callback detection)
        IF v_payment.provider_hash IS DISTINCT FROM p_provider_hash
           OR v_payment.verified_amount IS DISTINCT FROM p_verified_amount
           OR v_payment.verified_currency IS DISTINCT FROM p_verified_currency
           OR v_payment.verified_account_id IS DISTINCT FROM p_verified_account_id
           OR v_payment.provider_paid_at IS DISTINCT FROM p_provider_paid_at THEN
            RAISE EXCEPTION 'Conflicting callback for completed payment';
        END IF;
        RETURN jsonb_build_object(
            'status', 'successful',
            'subscription_id', v_payment.subscription_id,
            'billing_period_id', v_payment.billing_period_id,
            'period_sequence', (SELECT period_sequence FROM public.subscription_billing_periods WHERE id = v_payment.billing_period_id)
        );
    END IF;

    -- 5. Layer 2: Different payment, same provider hash — reject
    IF EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.provider_hash = p_provider_hash
          AND pt.payment_provider = 'bakong'
          AND pt.status = 'successful'
          AND pt.id <> v_payment.id
    ) THEN
        RAISE EXCEPTION 'Provider transaction already completed';
    END IF;

    -- 6. NULL-safe evidence validation (all required on completion)
    IF p_verified_amount IS NULL OR p_verified_currency IS NULL 
       OR p_provider_paid_at IS NULL OR p_verified_account_id IS NULL THEN
        RAISE EXCEPTION 'Required verification fields missing';
    END IF;
    
    -- 7. Evidence matches stored payment
    IF p_verified_amount <> v_payment.amount OR p_verified_currency <> v_payment.currency THEN
        RAISE EXCEPTION 'Amount or currency mismatch';
    END IF;
    
    -- 8. Account ID normalization + comparison
    IF lower(trim(p_verified_account_id)) <> lower(trim(p_expected_account_id)) THEN
        RAISE EXCEPTION 'Account ID mismatch';
    END IF;

    -- 9. Lock period record
    SELECT * INTO v_period FROM public.subscription_billing_periods WHERE id = v_payment.billing_period_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Billing period not found'; END IF;

    -- 10. Period status validation (C7: durable quarantine BEFORE time-window check)
    IF v_period.status <> 'pending' THEN
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
                'reason', CASE 
                    WHEN v_period.status = 'expired' THEN 'period_expired'
                    WHEN v_period.status = 'failed' THEN 'period_failed'
                    ELSE 'late_payment'
                END,
                'payment_id', v_payment.id
            );
        ELSIF v_period.status = 'review_required' THEN
            RAISE EXCEPTION 'Payment already under review';
        ELSIF v_period.status = 'paid' THEN
            RAISE EXCEPTION 'Billing period already paid';
        ELSE
            RAISE EXCEPTION 'Billing period not payable';
        END IF;
    END IF;

    -- 11. Bakong validation (LIVE EXACT — from Phase A evidence, only for pending periods)
    IF v_payment.expires_at <= now() THEN RAISE EXCEPTION 'Payment expired'; END IF;
    IF p_provider_paid_at < v_payment.created_at - interval '1 minute'
       OR p_provider_paid_at > v_payment.expires_at THEN
        RAISE EXCEPTION 'Provider payment time outside valid window';
    END IF;

    -- 12. Validate amount/currency against period (authoritative)
    IF p_verified_amount <> v_period.tier_price OR p_verified_currency <> v_period.tier_currency THEN
        RAISE EXCEPTION 'Amount/currency mismatch with billing period';
    END IF;

    IF v_is_initial THEN
        -- ============================================================
        -- INITIAL SUBSCRIPTION ACTIVATION (not creation!)
        -- ============================================================
        SELECT * INTO v_tier FROM public.subscription_tiers WHERE id = (v_payment.metadata ->> 'subscription_tier_id')::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'Tier not found'; END IF;
        IF v_tier.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tier deleted'; END IF;

        v_interval := CASE v_tier.billing_interval
            WHEN 'monthly' THEN interval '1 month'
            WHEN 'quarterly' THEN interval '3 months'
            WHEN 'yearly' THEN interval '1 year'
            ELSE interval '1 month'
        END;

        -- Lock subscription row
        SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
        IF v_sub.status <> 'pending' THEN RAISE EXCEPTION 'Subscription not in pending state'; END IF;

        -- Identity validation (typed columns only)
        IF v_sub.user_id IS DISTINCT FROM v_payment.subscriber_id THEN
            RAISE EXCEPTION 'Subscriber identity mismatch';
        END IF;
        IF v_sub.creator_id IS DISTINCT FROM v_payment.creator_id THEN
            RAISE EXCEPTION 'Creator identity mismatch';
        END IF;
        IF v_sub.payment_provider IS DISTINCT FROM v_payment.payment_provider THEN
            RAISE EXCEPTION 'Payment provider mismatch';
        END IF;

        -- ACTIVATE the existing subscription (created at checkout)
        UPDATE public.subscriptions
        SET status = 'active',
            current_period_start = v_period.period_start,
            current_period_end = v_period.period_end,
            current_period_id = v_period.id,
            payment_provider = 'bakong',
            provider_subscription_id = v_payment.metadata ->> 'provider_subscription_id',
            provider_customer_id = v_payment.metadata ->> 'provider_customer_id',
            last_payment_id = v_payment.id,
            updated_at = now()
        WHERE id = v_payment.subscription_id
        RETURNING id INTO v_payment.subscription_id;

        -- Verify affected rows
        IF NOT FOUND THEN RAISE EXCEPTION 'Subscription activation failed'; END IF;

        -- Update period → paid
        UPDATE public.subscription_billing_periods
        SET status = 'paid', paid_at = p_provider_paid_at, payment_id = v_payment.id
        WHERE id = v_period.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Period update failed'; END IF;

        -- Update payment → completed
        UPDATE public.payment_transactions
        SET status = 'successful',
            provider_hash = p_provider_hash,
            provider_paid_at = p_provider_paid_at,
            verified_at = now(),
            verified_amount = p_verified_amount,
            verified_currency = p_verified_currency,
            verified_account_id = p_verified_account_id,
            updated_at = now()
        WHERE id = v_payment.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Payment update failed'; END IF;

        RETURN jsonb_build_object(
            'status', 'successful',
            'subscription_id', v_payment.subscription_id,
            'billing_period_id', v_period.id,
            'period_sequence', v_period.period_sequence,
            'period_start', v_period.period_start,
            'period_end', v_period.period_end
        );

    ELSE
        -- ============================================================
        -- RENEWAL
        -- ============================================================
        SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;

        -- Validate subscription matches payment
        IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN RAISE EXCEPTION 'Subscription not eligible for renewal'; END IF;
        IF v_sub.payment_provider <> 'bakong' THEN RAISE EXCEPTION 'Provider mismatch'; END IF;
        IF v_sub.creator_id IS DISTINCT FROM v_payment.creator_id THEN RAISE EXCEPTION 'Creator mismatch'; END IF;
        IF v_sub.user_id IS DISTINCT FROM v_payment.subscriber_id THEN RAISE EXCEPTION 'Subscriber mismatch'; END IF;

        -- Validate period matches subscription's NEXT expected period
        IF v_period.period_sequence <> (
            SELECT COALESCE(MAX(period_sequence), 0) + 1 
            FROM public.subscription_billing_periods 
            WHERE subscription_id = v_sub.id
        ) THEN
            RAISE EXCEPTION 'Billing period sequence mismatch';
        END IF;

        SELECT * INTO v_tier FROM public.subscription_tiers WHERE id = v_sub.tier_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Tier not found'; END IF;
        IF v_tier.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tier deleted'; END IF;
        IF v_payment.amount IS DISTINCT FROM v_tier.price OR v_payment.currency IS DISTINCT FROM v_tier.currency THEN
            RAISE EXCEPTION 'Tier price/currency mismatch';
        END IF;

        v_interval := CASE v_tier.billing_interval
            WHEN 'monthly' THEN interval '1 month'
            WHEN 'quarterly' THEN interval '3 months'
            WHEN 'yearly' THEN interval '1 year'
            ELSE interval '1 month'
        END;

        -- Atomic: mark period paid + advance subscription
        UPDATE public.subscription_billing_periods
        SET status = 'paid', paid_at = p_provider_paid_at, payment_id = v_payment.id
        WHERE id = v_period.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Period update failed'; END IF;

        UPDATE public.payment_transactions
        SET status = 'successful',
            provider_hash = p_provider_hash,
            provider_paid_at = p_provider_paid_at,
            verified_at = now(),
            verified_amount = p_verified_amount,
            verified_currency = p_verified_currency,
            verified_account_id = p_verified_account_id,
            updated_at = now()
        WHERE id = v_payment.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Payment update failed'; END IF;

        UPDATE public.subscriptions
        SET current_period_id = v_period.id,
            current_period_start = v_period.period_start,
            current_period_end = v_period.period_end,
            status = CASE WHEN v_sub.status = 'past_due' THEN 'active' ELSE v_sub.status END,
            cancel_at_period_end = FALSE,
            last_payment_id = v_payment.id,
            updated_at = now()
        WHERE id = v_sub.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Subscription update failed'; END IF;

        RETURN jsonb_build_object(
            'status', 'successful',
            'subscription_id', v_sub.id,
            'billing_period_id', v_period.id,
            'period_sequence', v_period.period_sequence,
            'period_start', v_period.period_start,
            'period_end', v_period.period_end
        );
    END IF;
END $function$;

REVOKE ALL ON FUNCTION public.streamkit_complete_bakong_subscription(uuid, text, numeric, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_complete_bakong_subscription(uuid, text, numeric, text, text, text, timestamptz) TO service_role;

-- ============================================================
-- 2. STREAMKIT_CREATE_BAKONG_SUBSCRIPTION_PAYMENT (C6: Stable Intent Key)
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_create_bakong_subscription_payment(
    p_tier_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_subscriber_id uuid := auth.uid();
    v_tier public.subscription_tiers%rowtype;
    v_checkout_intent_key text;
    v_existing_payment public.payment_transactions%rowtype;
    v_payment_id uuid;
    v_period_id uuid;
    v_interval interval;
    v_sub_id uuid;
BEGIN
    IF v_subscriber_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Validate tier
    SELECT * INTO v_tier FROM public.subscription_tiers WHERE id = p_tier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tier not found'; END IF;
    IF v_tier.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tier unavailable'; END IF;
    IF v_tier.user_id = v_subscriber_id THEN RAISE EXCEPTION 'Cannot subscribe to own tier'; END IF;

    -- Check existing active subscription
    IF EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tier_id = p_tier_id AND user_id = v_subscriber_id
          AND status IN ('active', 'trialing', 'past_due')
    ) THEN
        RAISE EXCEPTION 'Already subscribed to this tier';
    END IF;

    -- Stable intent key (deterministic per subscriber+tier)
    -- pgcrypto.digest() is fully qualified to work under search_path = ''
    v_checkout_intent_key := encode(
        pgcrypto.digest(v_subscriber_id::text || ':' || p_tier_id::text || ':' || 'checkout', 'sha256'),
        'hex'
    );

    -- Atomic reservation: try to insert payment with intent key
    BEGIN
        -- Create subscription intent (pending, no period yet)
        v_sub_id := gen_random_uuid();
        INSERT INTO public.subscriptions (
            id, tier_id, creator_id, user_id, status,
            current_period_start, current_period_end,
            payment_provider, metadata
        ) VALUES (
            v_sub_id, v_tier.id, v_tier.user_id, v_subscriber_id, 'pending',
            now(), now() + interval '1 day',
            'bakong', jsonb_build_object('subscription_tier_id', v_tier.id)
        );

        -- Create Period 1 in ledger
        v_interval := CASE v_tier.billing_interval
            WHEN 'monthly' THEN interval '1 month'
            WHEN 'quarterly' THEN interval '3 months'
            WHEN 'yearly' THEN interval '1 year'
            ELSE interval '1 month'
        END;
        v_period_id := gen_random_uuid();
        INSERT INTO public.subscription_billing_periods (
            id, subscription_id, period_sequence, period_start, period_end,
            tier_price, tier_currency, billing_interval, status
        ) VALUES (
            v_period_id, v_sub_id, 1,
            now(), now() + v_interval,
            v_tier.price, v_tier.currency, v_tier.billing_interval, 'pending'
        );

        -- Create payment with intent key
        v_payment_id := gen_random_uuid();
        INSERT INTO public.payment_transactions (
            id, creator_id, donor_name, amount, currency, message,
            payment_provider, payment_class, status, expires_at,
            subscriber_id, subscription_id, billing_period_id, checkout_intent_key,
            metadata
        ) VALUES (
            v_payment_id, v_tier.user_id, 'Subscription', v_tier.price, v_tier.currency, '',
            'bakong', 'subscription_new', 'pending', now() + interval '5 minutes',
            v_subscriber_id, v_sub_id, v_period_id, v_checkout_intent_key,
            jsonb_build_object(
                'subscription_tier_id', v_tier.id,
                'provider_subscription_id', v_tier.id || '_' || v_subscriber_id,
                'provider_customer_id', v_subscriber_id
            )
        );

    EXCEPTION WHEN unique_violation THEN
        -- Another request won the reservation — fetch existing
        SELECT * INTO v_existing_payment
        FROM public.payment_transactions
        WHERE checkout_intent_key = v_checkout_intent_key
          AND payment_class = 'subscription_new'
          AND status IN ('pending', 'processing');
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'payment_id', v_existing_payment.id,
                'expires_at', v_existing_payment.expires_at,
                'amount', v_existing_payment.amount,
                'currency', v_existing_payment.currency,
                'idempotent', true
            );
        END IF;
        RAISE;
    END;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'expires_at', now() + interval '5 minutes',
        'amount', v_tier.price,
        'currency', v_tier.currency,
        'idempotent', false
    );
END $function$;

REVOKE ALL ON FUNCTION public.streamkit_create_bakong_subscription_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_create_bakong_subscription_payment(uuid) TO authenticated;

-- ============================================================
-- 3. STREAMKIT_CREATE_BAKONG_RENEWAL_PAYMENT (C11: Advisory Lock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_create_bakong_renewal_payment(p_subscription_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_sub public.subscriptions%rowtype;
    v_tier public.subscription_tiers%rowtype;
    v_payment_id uuid;
    v_period_id uuid;
    v_next_seq integer;
    v_interval interval;
BEGIN
    -- Service-role verified by grant
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
    IF v_sub.status NOT IN ('active','trialing','past_due') THEN RAISE EXCEPTION 'Not eligible for renewal'; END IF;
    IF v_sub.payment_provider <> 'bakong' THEN RAISE EXCEPTION 'Not a Bakong subscription'; END IF;

    SELECT * INTO v_tier FROM public.subscription_tiers WHERE id = v_sub.tier_id;
    IF NOT FOUND OR v_tier.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tier unavailable'; END IF;

    -- Advisory lock prevents concurrent period sequence allocation
    PERFORM pg_advisory_xact_lock(hashtext(v_sub.id::text));

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

    v_next_seq := public.get_next_period_sequence(v_sub.id);

    v_interval := CASE v_tier.billing_interval
        WHEN 'monthly' THEN interval '1 month'
        WHEN 'quarterly' THEN interval '3 months'
        WHEN 'yearly' THEN interval '1 year'
        ELSE interval '1 month'
    END;

    -- Create next period in ledger
    v_period_id := gen_random_uuid();
    INSERT INTO public.subscription_billing_periods (
        id, subscription_id, period_sequence, period_start, period_end,
        tier_price, tier_currency, billing_interval, status
    ) VALUES (
        v_period_id, v_sub.id, v_next_seq,
        v_sub.current_period_end, v_sub.current_period_end + v_interval,
        v_tier.price, v_tier.currency, v_tier.billing_interval, 'pending'
    );

    -- Create renewal payment (unique index prevents duplicate for same period)
    v_payment_id := gen_random_uuid();
    INSERT INTO public.payment_transactions (
        id, creator_id, donor_name, amount, currency, message,
        payment_provider, payment_class, status, expires_at,
        subscription_id, subscriber_id, billing_period_id,
        metadata
    ) VALUES (
        v_payment_id, v_sub.creator_id, 'Renewal', v_tier.price, v_tier.currency, '',
        'bakong', 'subscription_renewal', 'pending', now() + interval '5 minutes',
        v_sub.id, v_sub.user_id, v_period_id,
        jsonb_build_object(
            'renewal_for_billing_period_id', v_sub.current_period_id,
            'next_billing_period_id', v_period_id,
            'provider_customer_id', v_sub.provider_customer_id
        )
    );

    RETURN jsonb_build_object('payment_id', v_payment_id, 'expires_at', now() + interval '5 minutes', 'amount', v_tier.price, 'currency', v_tier.currency);
END $$;
REVOKE ALL ON FUNCTION public.streamkit_create_bakong_renewal_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_create_bakong_renewal_payment(uuid) TO service_role;

-- ============================================================
-- 4. CANCELLATION FUNCTIONS (3 Separate Paths)
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_cancel_subscription_user(p_subscription_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_sub public.subscriptions%rowtype;
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
    
    -- Creator schedules cancellation (subscriber-initiated NOT approved for launch)
    IF v_sub.creator_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Only creator may schedule cancellation';
    END IF;
    
    IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
        RAISE EXCEPTION 'Subscription not cancellable';
    END IF;
    
    IF v_sub.cancel_at_period_end THEN
        RETURN jsonb_build_object('status', v_sub.status, 'cancel_at_period_end', true, 'already_scheduled', true);
    END IF;
    
    UPDATE public.subscriptions
    SET cancel_at_period_end = true, updated_at = now()
    WHERE id = p_subscription_id;
    
    RETURN jsonb_build_object('status', v_sub.status, 'cancel_at_period_end', true, 'period_end', v_sub.current_period_end);
END $$;
REVOKE ALL ON FUNCTION public.streamkit_cancel_subscription_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_cancel_subscription_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.streamkit_cancel_subscription_admin(p_subscription_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_sub public.subscriptions%rowtype;
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    
    -- Graceful degradation if admin auth not configured
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_platform_admin') THEN
        RAISE EXCEPTION 'Administrative cancellation not available. Use service-role or scheduled cancellation.';
    END IF;
    
    IF NOT public.is_platform_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Platform admin required';
    END IF;
    
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
    
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false, updated_at = now()
    WHERE id = p_subscription_id;
    
    RETURN jsonb_build_object('status', 'cancelled', 'cancelled_at', now());
END $$;
REVOKE ALL ON FUNCTION public.streamkit_cancel_subscription_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_cancel_subscription_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.streamkit_cancel_subscription_system(p_subscription_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_sub public.subscriptions%rowtype;
BEGIN
    -- Service-role execution verified by grant
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
    
    IF NOT v_sub.cancel_at_period_end THEN
        RAISE EXCEPTION 'Not scheduled for cancellation';
    END IF;
    IF v_sub.current_period_end > now() THEN
        RAISE EXCEPTION 'Period not ended';
    END IF;
    
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false, updated_at = now()
    WHERE id = p_subscription_id;
    
    RETURN jsonb_build_object('status', 'cancelled', 'cancelled_at', now());
END $$;
REVOKE ALL ON FUNCTION public.streamkit_cancel_subscription_system(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_cancel_subscription_system(uuid) TO service_role;

-- ============================================================
-- 5. SCHEDULER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_process_cancellations(p_batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_batch_limit integer := GREATEST(1, LEAST(COALESCE(p_batch_size, 100), 1000));
    v_total_processed integer := 0;
    v_iteration_count integer;
BEGIN
    IF current_setting('role') <> 'service_role' THEN
        RAISE EXCEPTION 'Service-role required';
    END IF;
    
    LOOP
        UPDATE public.subscriptions
        SET status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false, updated_at = now()
        WHERE id IN (
            SELECT id FROM public.subscriptions
            WHERE cancel_at_period_end
              AND status IN ('active', 'trialing', 'past_due')
              AND current_period_end <= now()
            ORDER BY current_period_end
            LIMIT v_batch_limit
            FOR UPDATE SKIP LOCKED
        );
        
        GET DIAGNOSTICS v_iteration_count = ROW_COUNT;
        v_total_processed := v_total_processed + v_iteration_count;
        EXIT WHEN v_iteration_count = 0;
    END LOOP;
    
    RETURN v_total_processed;
END $$;
REVOKE ALL ON FUNCTION public.streamkit_process_cancellations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_process_cancellations(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.streamkit_expire_due_subscriptions(p_grace_period_days integer DEFAULT 7) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_count integer := 0;
    v_grace_days integer := GREATEST(0, COALESCE(p_grace_period_days, 7));
BEGIN
    IF current_setting('role') <> 'service_role' THEN
        RAISE EXCEPTION 'Service-role required';
    END IF;
    
    IF v_grace_days < 0 OR v_grace_days > 365 THEN
        RAISE EXCEPTION 'Invalid grace period: %', v_grace_days;
    END IF;
    
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = now()
    WHERE status = 'past_due'
      AND current_period_end < now() - (v_grace_days || ' days')::interval;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.streamkit_expire_due_subscriptions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_expire_due_subscriptions(integer) TO service_role;

-- ============================================================
-- 6. QUARANTINE RESOLUTION (C7: Service-Role Only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.streamkit_resolve_quarantined_payment_approve(
    p_payment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payment public.payment_transactions%rowtype;
    v_period public.subscription_billing_periods%rowtype;
    v_sub public.subscriptions%rowtype;
    v_tier public.subscription_tiers%rowtype;
BEGIN
    IF current_setting('role') <> 'service_role' THEN
        RAISE EXCEPTION 'Service-role required';
    END IF;
    
    SELECT * INTO v_payment FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND OR v_payment.status <> 'review_required' THEN
        RAISE EXCEPTION 'Payment not in review';
    END IF.
    
    IF v_payment.provider_hash IS NULL OR v_payment.verified_amount IS NULL THEN
        RAISE EXCEPTION 'Incomplete verification evidence';
    END IF.

    SELECT * INTO v_period FROM public.subscription_billing_periods WHERE id = v_payment.billing_period_id FOR UPDATE;
    IF v_period.status <> 'pending' THEN RAISE EXCEPTION 'Period not pending'; END IF.

    SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
    IF v_sub.status <> 'pending' THEN RAISE EXCEPTION 'Subscription not pending'; END IF.

    SELECT * INTO v_tier FROM public.subscription_tiers WHERE id = v_sub.tier_id;
    IF v_tier.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tier deleted'; END IF.

    UPDATE public.subscription_billing_periods
    SET status = 'paid', paid_at = v_payment.provider_paid_at, payment_id = v_payment.id
    WHERE id = v_period.id;

    UPDATE public.payment_transactions
    SET status = 'successful', updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.subscriptions
    SET status = 'active',
        current_period_start = v_period.period_start,
        current_period_end = v_period.period_end,
        current_period_id = v_period.id,
        last_payment_id = v_payment.id,
        updated_at = now()
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('status', 'approved', 'subscription_id', v_sub.id);
END $$;
REVOKE ALL ON FUNCTION public.streamkit_resolve_quarantined_payment_approve(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_resolve_quarantined_payment_approve(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.streamkit_resolve_quarantined_payment_reject(
    p_payment_id uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payment public.payment_transactions%rowtype;
BEGIN
    IF current_setting('role') <> 'service_role' THEN
        RAISE EXCEPTION 'Service-role required';
    END IF.
    
    SELECT * INTO v_payment FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND OR v_payment.status <> 'review_required' THEN
        RAISE EXCEPTION 'Payment not in review';
    END IF.

    UPDATE public.payment_transactions
    SET status = 'failed', review_reason = p_reason, updated_at = now()
    WHERE id = p_payment_id;

    RETURN jsonb_build_object('status', 'rejected');
END $$;
REVOKE ALL ON FUNCTION public.streamkit_resolve_quarantined_payment_reject(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streamkit_resolve_quarantined_payment_reject(uuid, text) TO service_role;

-- ============================================================
-- 7. HELPER: GET_NEXT_PERIOD_SEQUENCE (C1: Advisory Lock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_next_period_sequence(p_subscription_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_seq integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_subscription_id::text));
    SELECT COALESCE(MAX(period_sequence), 0) + 1 INTO v_seq
    FROM public.subscription_billing_periods WHERE subscription_id = p_subscription_id;
    RETURN v_seq;
END $$;
REVOKE ALL ON FUNCTION public.get_next_period_sequence(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_period_sequence(uuid) TO service_role;
```

---

## 0003_tier_safety_net.sql

```sql
-- 0003_tier_safety_net.sql
-- Idempotent safety net for tier columns
-- Depends on: 0001 (runs after core schema)

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='currency') THEN
        ALTER TABLE public.subscription_tiers ADD COLUMN currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KHR'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='billing_interval') THEN
        ALTER TABLE public.subscription_tiers ADD COLUMN billing_interval billing_interval NOT NULL DEFAULT 'monthly';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_tiers' AND column_name='deleted_at') THEN
        ALTER TABLE public.subscription_tiers ADD COLUMN deleted_at timestamptz;
    END IF;
END $$;
NOTIFY pgrst, 'reload schema';
```

---

## ROLLBACK ORDER (Reverse Dependency)

```sql
-- ROLLBACK 0003: Drop tier columns (if added by this migration)
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS billing_interval;
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS currency;

-- ROLLBACK 0002: Drop new RPCs
-- DROP FUNCTION IF EXISTS public.get_next_period_sequence(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_resolve_quarantined_payment_reject(uuid, text);
-- DROP FUNCTION IF EXISTS public.streamkit_resolve_quarantined_payment_approve(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_expire_due_subscriptions(integer);
-- DROP FUNCTION IF EXISTS public.streamkit_process_cancellations(integer);
-- DROP FUNCTION IF EXISTS public.streamkit_cancel_subscription_system(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_cancel_subscription_admin(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_cancel_subscription_user(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_create_bakong_renewal_payment(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_create_bakong_subscription_payment(uuid);
-- DROP FUNCTION IF EXISTS public.streamkit_complete_bakong_subscription(uuid, text, numeric, text, text, text, timestamptz);
-- NOTE: streamkit_complete_bakong_payment is PRESERVED — NOT dropped

-- ROLLBACK 0001: Drop tables, indexes, policies, columns (in reverse FK order)
-- DROP INDEX IF EXISTS payment_transactions_pending_renewal_unique;
-- DROP INDEX IF EXISTS payment_transactions_checkout_intent_unique;
-- DROP INDEX IF EXISTS payment_transactions_bakong_hash_global_unique;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS review_reason;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS checkout_intent_key;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS verified_at;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS verified_account_id;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS verified_currency;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS verified_amount;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS provider_paid_at;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS provider_hash;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS payment_provider;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS billing_period_id;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS subscription_id;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS subscriber_id;
-- ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS payment_class;
-- DROP TABLE IF EXISTS public.subscription_billing_periods;
-- DROP TABLE IF EXISTS public.subscriptions;
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS billing_interval;
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS currency;
-- ALTER TABLE public.subscription_tiers DROP COLUMN IF EXISTS deleted_at;
-- DROP TYPE IF EXISTS billing_interval;
-- DROP TYPE IF EXISTS payment_provider;
-- DROP TYPE IF EXISTS subscription_status;
```

---

**End of Migration SQL v3.1.1**