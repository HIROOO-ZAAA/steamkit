-- 1. Create settings table for tipping, media share, and widgets
CREATE TABLE IF NOT EXISTS public.creator_tip_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  is_active BOOLEAN DEFAULT true,
  min_amount_usd NUMERIC DEFAULT 0.25,
  min_amount_khr NUMERIC DEFAULT 1000.00,
  allow_media_share BOOLEAN DEFAULT false,
  min_media_amount NUMERIC DEFAULT 1.00,
  sec_per_usd INT DEFAULT 30,
  allow_tts BOOLEAN DEFAULT true,
  min_tts_amount NUMERIC DEFAULT 0.50,
  tts_voice TEXT DEFAULT 'en-US-Standard-A',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Media Queue Table
CREATE TABLE IF NOT EXISTS public.media_share_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tip_id UUID REFERENCES public.tips(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  duration_seconds INT NOT NULL,
  tipper_name TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'playing', 'played', 'skipped'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.creator_tip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_share_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can read tip settings by creator') THEN
    CREATE POLICY "Public can read tip settings by creator" ON public.creator_tip_settings
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Creators can manage their own tip settings') THEN
    CREATE POLICY "Creators can manage their own tip settings" ON public.creator_tip_settings
      FOR ALL USING (auth.uid() = creator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can read active media queue') THEN
    CREATE POLICY "Public can read active media queue" ON public.media_share_queue
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Creators can manage their media queue') THEN
    CREATE POLICY "Creators can manage their media queue" ON public.media_share_queue
      FOR ALL USING (auth.uid() = creator_id);
  END IF;
END $$;


-- creator_tip_settings is read and written by server routes through createAdminClient(),
-- which runs as service_role. That role does not inherit from anon or
-- authenticated, so a grant to authenticated alone leaves it locked out:
-- PostgREST answers 42501 and the route fails with "permission denied for
-- table creator_tip_settings". RLS is separate -- it narrows what a granted role may do,
-- it never grants table access.
-- anon reads this to build the public donation form on /pay/[username]. Safe to
-- expose: minimums, feature toggles, a TTS voice name. No credentials.
grant select on table public.creator_tip_settings to anon, authenticated, service_role;
grant insert, update on table public.creator_tip_settings to authenticated, service_role;


-- service_role needs full DML on creator_tip_settings because server routes reach it
-- through createAdminClient(). This is a separate grant so the narrower
-- privileges already granted to authenticated above are left unchanged.
grant select, insert, update, delete on table public.creator_tip_settings to service_role;


-- creator_tip_settings: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select on table public.creator_tip_settings to anon, authenticated, service_role;
grant select, insert, update on table public.creator_tip_settings to authenticated, service_role;


-- media_share_queue: required by dashboard code running as the signed-in user.
-- RLS still decides WHICH rows; this grants the table itself.
grant select, update on table public.media_share_queue to authenticated, service_role;
grant select, insert, update, delete on table public.media_share_queue to service_role;
