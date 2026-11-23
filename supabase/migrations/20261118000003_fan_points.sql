-- 20261118000003_fan_points.sql
-- Fan Points & Redeems system
-- Depends on: profiles, payment_transactions

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE redeem_type AS ENUM ('text', 'voice', 'jumpscare', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE redeem_status AS ENUM ('active', 'paused', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 1. FAN_POINTS TABLE (per subscriber per creator)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fan_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscriber_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned integer NOT NULL DEFAULT 0,
    total_spent integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (creator_id, subscriber_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fan_points_creator ON public.fan_points(creator_id);
CREATE INDEX IF NOT EXISTS idx_fan_points_subscriber ON public.fan_points(subscriber_id);

-- ============================================================
-- 2. REDEEMS TABLE (creator-defined redeemable actions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.redeems (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    type redeem_type NOT NULL DEFAULT 'text',
    cost integer NOT NULL CHECK (cost > 0),
    cooldown_seconds integer NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0),
    max_per_stream integer,
    max_per_user_per_stream integer,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    status redeem_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_redeems_creator ON public.redeems(creator_id);
CREATE INDEX IF NOT EXISTS idx_redeems_status ON public.redeems(status) WHERE status = 'active';

-- ============================================================
-- 3. REDEEM_CLAIMS TABLE (audit trail of spent points)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.redeem_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    redeem_id uuid NOT NULL REFERENCES public.redeems(id) ON DELETE RESTRICT,
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscriber_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    points_spent integer NOT NULL CHECK (points_spent > 0),
    input_text text,
    input_data jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'rejected', 'refunded')),
    fulfilled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_redeem_claims_redeem ON public.redeem_claims(redeem_id);
CREATE INDEX IF NOT EXISTS idx_redeem_claims_creator ON public.redeem_claims(creator_id);
CREATE INDEX IF NOT EXISTS idx_redeem_claims_subscriber ON public.redeem_claims(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_redeem_claims_status ON public.redeem_claims(status);

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- fan_points
ALTER TABLE public.fan_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fan_points FROM anon, authenticated;
GRANT SELECT ON TABLE public.fan_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fan_points TO service_role;

DROP POLICY IF EXISTS "Creator views own fan points" ON public.fan_points;
CREATE POLICY "Creator views own fan points" ON public.fan_points
    FOR SELECT TO authenticated
    USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Subscriber views own fan points" ON public.fan_points;
CREATE POLICY "Subscriber views own fan points" ON public.fan_points
    FOR SELECT TO authenticated
    USING (subscriber_id = auth.uid());

-- redeems
ALTER TABLE public.redeems ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.redeems FROM anon, authenticated;
GRANT SELECT ON TABLE public.redeems TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.redeems TO service_role;

DROP POLICY IF EXISTS "Creator manages own redeems" ON public.redeems;
CREATE POLICY "Creator manages own redeems" ON public.redeems
    FOR ALL TO authenticated
    USING (creator_id = auth.uid() AND (status <> 'deleted' OR status IS NULL));

DROP POLICY IF EXISTS "Public views active redeems" ON public.redeems;
CREATE POLICY "Public views active redeems" ON public.redeems
    FOR SELECT TO authenticated
    USING (status = 'active');

-- redeem_claims
ALTER TABLE public.redeem_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.redeem_claims FROM anon, authenticated;
GRANT SELECT ON TABLE public.redeem_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.redeem_claims TO service_role;

DROP POLICY IF EXISTS "Creator views claims on own redeems" ON public.redeem_claims;
CREATE POLICY "Creator views claims on own redeems" ON public.redeem_claims
    FOR SELECT TO authenticated
    USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Subscriber views own claims" ON public.redeem_claims;
CREATE POLICY "Subscriber views own claims" ON public.redeem_claims
    FOR SELECT TO authenticated
    USING (subscriber_id = auth.uid());

-- ============================================================
-- 5. TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS set_fan_points_updated_at ON public.fan_points;
CREATE TRIGGER set_fan_points_updated_at
    BEFORE UPDATE ON public.fan_points
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_redeems_updated_at ON public.redeems;
CREATE TRIGGER set_redeems_updated_at
    BEFORE UPDATE ON public.redeems
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 6. HELPER: AWARD POINTS ON DONATION (service-role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_fan_points_on_donation(
    p_creator_id uuid,
    p_subscriber_id uuid,
    p_amount_khr numeric,
    p_amount_usd numeric,
    p_payment_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_points integer;
    v_rate_khr numeric := 10;  -- 10 points per KHR
    v_rate_usd numeric := 40000;  -- 40000 points per USD (approx 4000 KHR/USD)
BEGIN
    -- Calculate points: prefer KHR, fallback to USD
    IF p_amount_khr > 0 THEN
        v_points := FLOOR(p_amount_khr * v_rate_khr);
    ELSE
        v_points := FLOOR(p_amount_usd * v_rate_usd);
    END IF;

    IF v_points <= 0 THEN
        RETURN 0;
    END IF;

    -- Upsert fan_points row
    INSERT INTO public.fan_points (creator_id, subscriber_id, balance, total_earned)
    VALUES (p_creator_id, p_subscriber_id, v_points, v_points)
    ON CONFLICT (creator_id, subscriber_id) DO UPDATE SET
        balance = fan_points.balance + v_points,
        total_earned = fan_points.total_earned + v_points,
        updated_at = now()
    RETURNING balance INTO v_points;

    -- Log the award (could link to payment_transactions if needed)
    RETURN v_points;
END $$;

REVOKE ALL ON FUNCTION public.award_fan_points_on_donation(uuid, uuid, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_fan_points_on_donation(uuid, uuid, numeric, numeric, uuid) TO service_role;

-- ============================================================
-- 7. SPEND POINTS (service-role, called from API)
-- ============================================================
CREATE OR REPLACE FUNCTION public.spend_fan_points(
    p_redeem_id uuid,
    p_subscriber_id uuid,
    p_input_text text DEFAULT NULL,
    p_input_data jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_redeem public.redeems%rowtype;
    v_fan_points public.fan_points%rowtype;
    v_claim public.redeem_claims%rowtype;
    v_creator_id uuid;
    v_cooldown_ok boolean := true;
    v_stream_limit_ok boolean := true;
    v_user_limit_ok boolean := true;
BEGIN
    -- Lock redeem
    SELECT * INTO v_redeem FROM public.redeems WHERE id = p_redeem_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redeem not found'; END IF;
    IF v_redeem.status <> 'active' THEN RAISE EXCEPTION 'Redeem not active'; END IF;

    v_creator_id := v_redeem.creator_id;

    -- Check subscriber has enough points
    SELECT * INTO v_fan_points
    FROM public.fan_points
    WHERE creator_id = v_creator_id AND subscriber_id = p_subscriber_id
    FOR UPDATE;

    IF NOT FOUND OR v_fan_points.balance < v_redeem.cost THEN
        RAISE EXCEPTION 'Insufficient points';
    END IF;

    -- Cooldown check
    IF v_redeem.cooldown_seconds > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.redeem_claims
            WHERE redeem_id = p_redeem_id
              AND subscriber_id = p_subscriber_id
              AND created_at > now() - (v_redeem.cooldown_seconds || ' seconds')::interval
        ) INTO v_cooldown_ok;
        IF NOT v_cooldown_ok THEN
            RAISE EXCEPTION 'On cooldown';
        END IF;
    END IF;

    -- Per-stream limits (simplified: last 24h as stream window)
    IF v_redeem.max_per_stream IS NOT NULL THEN
        SELECT COUNT(*) < v_redeem.max_per_stream INTO v_stream_limit_ok
        FROM public.redeem_claims
        WHERE redeem_id = p_redeem_id
          AND created_at > now() - interval '24 hours';
        IF NOT v_stream_limit_ok THEN
            RAISE EXCEPTION 'Stream limit reached';
        END IF;
    END IF;

    IF v_redeem.max_per_user_per_stream IS NOT NULL THEN
        SELECT COUNT(*) < v_redeem.max_per_user_per_stream INTO v_user_limit_ok
        FROM public.redeem_claims
        WHERE redeem_id = p_redeem_id
          AND subscriber_id = p_subscriber_id
          AND created_at > now() - interval '24 hours';
        IF NOT v_user_limit_ok THEN
            RAISE EXCEPTION 'User stream limit reached';
        END IF;
    END IF;

    -- Deduct points
    UPDATE public.fan_points
    SET balance = balance - v_redeem.cost,
        total_spent = total_spent + v_redeem.cost,
        updated_at = now()
    WHERE creator_id = v_creator_id AND subscriber_id = p_subscriber_id;

    -- Create claim
    INSERT INTO public.redeem_claims (
        redeem_id, creator_id, subscriber_id, points_spent,
        input_text, input_data, status
    ) VALUES (
        p_redeem_id, v_creator_id, p_subscriber_id, v_redeem.cost,
        p_input_text, p_input_data, 'pending'
    ) RETURNING * INTO v_claim;

    RETURN jsonb_build_object(
        'claim_id', v_claim.id,
        'redeem_id', p_redeem_id,
        'title', v_redeem.title,
        'type', v_redeem.type,
        'cost', v_redeem.cost,
        'config', v_redeem.config,
        'input_text', p_input_text,
        'input_data', p_input_data,
        'status', 'pending',
        'new_balance', v_fan_points.balance - v_redeem.cost
    );
END $$;

REVOKE ALL ON FUNCTION public.spend_fan_points(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_fan_points(uuid, uuid, text, jsonb) TO service_role;

-- ============================================================
-- NOTIFY
-- ============================================================
NOTIFY pgrst, 'reload schema';