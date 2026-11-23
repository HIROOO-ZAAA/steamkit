-- STREAMKIT_V3.1.1_READ_ONLY_PREFLIGHT.sql
-- Read-Only Live Database Verification — 10 Sections
-- Execute against LIVE database to confirm Phase A evidence before migration
-- NO WRITE OPERATIONS — SELECT only
-- IDENTICAL to v3.1 — no changes required

-- ============================================================
-- SECTION 1: CORE SCHEMA COMPATIBILITY
-- ============================================================
-- 1.1 payment_transactions.donation_id nullability (C3: subscriptions use NULL)
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'donation_id';

-- 1.2 payment_provider enum values
SELECT t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'payment_provider' AND t.typnamespace = 'public'::regnamespace;

-- 1.3 subscription_tiers columns for v3.1
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscription_tiers'
  AND column_name IN ('deleted_at', 'currency', 'billing_interval');

-- 1.4 Existing subscriptions table structure
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscriptions'
ORDER BY ordinal_position;

-- 1.5 Current subscription statuses in use
SELECT status, count(*) FROM public.subscriptions GROUP BY status;

-- 1.6 Existing payment_transactions columns (schema-first for C4)
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_transactions'
ORDER BY ordinal_position;

-- ============================================================
-- SECTION 2: LIVE DONATION RPC PRESERVATION (C2) — COMPLETE CAPTURE
-- ============================================================
-- 2.1 streamkit_complete_bakong_payment — Full definition
SELECT
    p.proname,
    pg_get_functiondef(p.oid) AS definition,
    p.prosecdef AS security_definer,
    p.proconfig AS search_path,
    n.nspname AS schema,
    rolname AS owner,
    pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_function_result(p.oid) AS returns,
    p.provolatile
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON p.proowner = r.oid
WHERE n.nspname = 'public' AND p.proname = 'streamkit_complete_bakong_payment';

-- 2.2 Function properties
SELECT
    p.proname,
    p.provolatile,
    p.proleakproof,
    p.proisstrict,
    p.proretset,
    p.proargtypes::regtype[],
    p.prorettype::regtype
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'streamkit_complete_bakong_payment';

-- 2.3 Function ACL (grants)
SELECT
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'streamkit_complete_bakong_payment';

-- 2.4 Function dependencies (callers)
SELECT
    dependent_ns.nspname AS dependent_schema,
    dependent_pr.proname AS dependent_function,
    pg_get_functiondef(dependent_pr.oid) AS dependent_definition
FROM pg_depend d
JOIN pg_proc dependent_pr ON d.objid = dependent_pr.oid
JOIN pg_namespace dependent_ns ON dependent_pr.pronamespace = dependent_ns.oid
JOIN pg_proc target_pr ON d.refobjid = target_pr.oid
JOIN pg_namespace target_ns ON target_pr.pronamespace = target_ns.oid
WHERE target_ns.nspname = 'public' AND target_pr.proname = 'streamkit_complete_bakong_payment'
  AND d.deptype = 'n';

-- 2.5 ABA payment function (for comparison — must NOT be modified)
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'streamkit_complete_aba_payment';

-- ============================================================
-- SECTION 3: BAKONG PAYMENT BEHAVIOR VERIFICATION
-- ============================================================
-- 3.1 Recent Bakong payments (last 50)
SELECT
    pt.id, pt.status, pt.amount, pt.currency, pt.payment_provider,
    pt.provider_hash, pt.provider_paid_at, pt.verified_at,
    pt.verified_amount, pt.verified_currency, pt.verified_account_id,
    pt.donation_id, pt.payment_class,
    pt.expires_at, pt.created_at
FROM public.payment_transactions pt
WHERE pt.payment_provider = 'bakong'
ORDER BY pt.created_at DESC
LIMIT 50;

-- 3.2 Payment expiry windows (verify 5-min expiry)
SELECT
    id, status, expires_at, created_at,
    EXTRACT(EPOCH FROM (expires_at - created_at))/60 AS expiry_minutes,
    provider_paid_at,
    EXTRACT(EPOCH FROM (provider_paid_at - created_at))/60 AS paid_minutes_after_created
FROM public.payment_transactions
WHERE payment_provider = 'bakong' AND status = 'successful'
ORDER BY created_at DESC
LIMIT 20;

-- 3.3 Paid_at validation window (live function checks: created_at - 1min to expires_at)
SELECT
    id, created_at, expires_at, provider_paid_at,
    provider_paid_at >= created_at - interval '1 minute' AS within_window_start,
    provider_paid_at <= expires_at AS within_window_end
FROM public.payment_transactions
WHERE payment_provider = 'bakong' AND status = 'successful' AND provider_paid_at IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- 3.4 Duplicate provider_hash check (must be unique per successful payment)
SELECT provider_hash, count(*), array_agg(id) AS payment_ids
FROM public.payment_transactions
WHERE payment_provider = 'bakong' AND status = 'successful' AND provider_hash IS NOT NULL
GROUP BY provider_hash
HAVING count(*) > 1;

-- ============================================================
-- SECTION 4: SUBSCRIPTION STATE MACHINE
-- ============================================================
-- 4.1 Current subscriptions (if table exists)
SELECT * FROM public.subscriptions ORDER BY created_at DESC LIMIT 20;

-- 4.2 Subscriptions by status
SELECT status, count(*) FROM public.subscriptions GROUP BY status;

-- 4.3 Subscriptions with provider info
SELECT id, tier_id, status, payment_provider, provider_subscription_id, provider_customer_id,
       current_period_start, current_period_end, cancel_at_period_end, cancelled_at
FROM public.subscriptions
ORDER BY created_at DESC;

-- ============================================================
-- SECTION 5: TIER CATALOG
-- ============================================================
-- 5.1 All tiers with v3.1 columns
SELECT id, user_id, name, price, currency, billing_interval, deleted_at, created_at
FROM public.subscription_tiers
ORDER BY created_at DESC;

-- 5.2 Active tiers per creator
SELECT user_id, count(*) AS active_tiers
FROM public.subscription_tiers
WHERE deleted_at IS NULL OR deleted_at > now()
GROUP BY user_id;

-- ============================================================
-- SECTION 6: RLS POLICY VERIFICATION
-- ============================================================
-- 6.1 subscriptions policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions';

-- 6.2 subscription_tiers policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscription_tiers';

-- 6.3 payment_transactions policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'payment_transactions';

-- ============================================================
-- SECTION 7: INDEX & CONSTRAINT VERIFICATION
-- ============================================================
-- 7.1 payment_transactions indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'payment_transactions';

-- 7.2 subscriptions indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'subscriptions';

-- 7.3 subscription_tiers indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'subscription_tiers';

-- 7.4 Foreign keys on payment_transactions
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = 'public' AND tc.table_name = 'payment_transactions' AND tc.constraint_type = 'FOREIGN KEY';

-- ============================================================
-- SECTION 8: FUNCTION AUTHORIZATION VERIFICATION
-- ============================================================
-- 8.1 All payment-related functions and their grants
SELECT
    p.proname,
    r.rolname AS owner,
    p.prosecdef AS security_definer,
    pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_function_result(p.oid) AS returns,
    array_agg(DISTINCT rp.grantee::text) AS granted_to
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON p.proowner = r.oid
LEFT JOIN information_schema.routine_privileges rp ON rp.routine_schema = n.nspname AND rp.routine_name = p.proname
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%bakong%' OR p.proname LIKE '%subscription%' OR p.proname LIKE '%cancel%' OR p.proname LIKE '%expire%')
GROUP BY p.proname, r.rolname, p.prosecdef, p.oid
ORDER BY p.proname;

-- ============================================================
-- SECTION 9: MIGRATION HISTORY
-- ============================================================
-- 9.1 Check for Supabase migration tracking
SELECT * FROM information_schema.tables WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations';

-- 9.2 If exists, show applied migrations
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;

-- 9.3 Check for any existing subscription-related migrations
SELECT * FROM supabase_migrations.schema_migrations WHERE version LIKE '%sub%' OR version LIKE '%000%';

-- ============================================================
-- SECTION 10: CONFIGURATION SETTINGS
-- ============================================================
-- 10.1 app.checkout_idempotency_secret (NOT used in v3.1 — deterministic SHA256)
SELECT current_setting('app.checkout_idempotency_secret', true) AS idempotency_secret;

-- 10.2 All custom app.* settings
SELECT name, setting
FROM pg_settings
WHERE name LIKE 'app.%';

-- ============================================================
-- VERIFICATION CHECKLIST (Manual Review)
-- ============================================================
-- [ ] 1.1 donation_id nullable = YES
-- [ ] 1.2 payment_provider enum contains 'bakong'
-- [ ] 1.3 subscription_tiers has deleted_at, currency, billing_interval
-- [ ] 1.4 subscriptions table either absent or has current_period_id
-- [ ] 1.6 Existing payment_transactions columns documented (schema-first)
-- [ ] 2.1 streamkit_complete_bakong_payment exists, SECURITY DEFINER, search_path=''
-- [ ] 2.2 Function returns jsonb, 7 params (id, hash, amount, currency, account, expected, paid_at)
-- [ ] 2.3 Grants: postgres (owner), service_role (execute)
-- [ ] 2.4 Webhook and status route call this function (not modified)
-- [ ] 2.5 streamkit_complete_aba_payment exists and unchanged
-- [ ] 3.1 Recent Bakong payments show expected structure
-- [ ] 3.2 Expiry window: created_at to expires_at = 5 minutes
-- [ ] 3.3 Paid_at within [created_at - 1min, expires_at]
-- [ ] 3.4 No duplicate provider_hash on successful payments
-- [ ] 4.x Subscription table state matches expectations
-- [ ] 5.x Tier catalog has required columns
-- [ ] 6.x RLS policies: Creator views tier subscriptions, Member views own
-- [ ] 7.x No conflicting indexes/constraints
-- [ ] 8.x Function grants match blueprint (service_role for completion, authenticated for checkout)
-- [ ] 9.x Migration tracking available
-- [ ] 10.1 Idempotency secret NOT required (v3.1 uses deterministic SHA256)

-- END OF PREFLIGHT