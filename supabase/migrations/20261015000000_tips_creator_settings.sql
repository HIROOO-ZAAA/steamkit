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
