-- Persist and expose the configured volume for cloned alert speech.
-- The same RPC returns base settings and per-tier overrides, so keep the new
-- field in both the table return and each tier JSON object.
alter table public.alert_settings add column if not exists tts_volume integer not null default 100;
drop function if exists public.streamkit_resolve_overlay(text);

create function public.streamkit_resolve_overlay(p_token text)
returns table (
  creator_id uuid,
  duration_seconds integer,
  sound_url text,
  animation_type text,
  font_color text,
  tts_enabled boolean,
  tts_volume integer,
  language text,
  pitch numeric,
  speed numeric,
  layout text,
  image_url text,
  image_scale integer,
  show_donor_profile boolean,
  message_template text,
  text_color text,
  bg_color text,
  enable_card boolean,
  font_family text,
  font_size integer,
  font_weight text,
  text_animation text,
  alert_animation text,
  text_delay integer,
  donor_avatar text,
  provider text,
  voice_id text,
  cloned_voice_id text,
  cloning_enabled boolean,
  tiers jsonb,
  voice_intro_enabled boolean,
  voice_intro_template text,
  tts_engine text,
  active_clone_id uuid,
  preset_id text,
  clone_fallback boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    credentials.creator_id,
    coalesce(alerts.duration_seconds, 6),
    coalesce(alerts.sound_url, 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'),
    coalesce(alerts.animation_type, 'bounce'),
    coalesce(alerts.font_color, '#10b981'),
    coalesce(alerts.tts_enabled, true),
    coalesce(alerts.tts_volume, 100),
    coalesce(voices.language, 'km-KH'),
    coalesce(voices.pitch, 1.0),
    coalesce(voices.speed, 1.0),
    coalesce(alerts.layout, 'image_top'),
    alerts.image_url,
    coalesce(alerts.image_scale, 50),
    coalesce(alerts.show_donor_profile, true),
    coalesce(alerts.message_template, 'Thank you {name} for {amount}{currency}'),
    coalesce(alerts.text_color, '#ffffff'),
    coalesce(alerts.bg_color, '#000000'),
    coalesce(alerts.enable_card, false),
    coalesce(alerts.font_family, '''Noto Sans Khmer'', sans-serif'),
    coalesce(alerts.font_size, 36),
    coalesce(alerts.font_weight, '700'),
    coalesce(alerts.text_animation, 'wiggle'),
    coalesce(alerts.alert_animation, 'bounceIn'),
    coalesce(alerts.text_delay, 0),
    coalesce(alerts.donor_avatar, '🦔'),
    coalesce(voices.provider, 'browser'),
    voices.voice_id,
    voices.cloned_voice_id,
    coalesce(voices.cloning_enabled, false),
    -- jsonb_agg over zero rows is NULL, and the overlay calls `tiers.filter()`
    -- on this without a guard, so an empty tier list must stay an array.
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tier_id', t.id,
          'name', t.name,
          'min_amount_usd', t.min_amount_usd,
          'min_amount_khr', t.min_amount_khr,
          'sort_order', t.sort_order,
          'duration_seconds', ts.duration_seconds,
          'sound_url', ts.sound_url,
          'font_color', ts.font_color,
          'tts_enabled', ts.tts_enabled,
          'tts_volume', ts.tts_volume,
          'layout', ts.layout,
          'image_url', ts.image_url,
          'image_scale', ts.image_scale,
          'show_donor_profile', ts.show_donor_profile,
          'message_template', ts.message_template,
          'text_color', ts.text_color,
          'bg_color', ts.bg_color,
          'enable_card', ts.enable_card,
          'font_family', ts.font_family,
          'font_size', ts.font_size,
          'font_weight', ts.font_weight,
          'text_animation', ts.text_animation,
          'alert_animation', ts.alert_animation,
          'text_delay', ts.text_delay,
          'donor_avatar', ts.donor_avatar,
          'configured', (ts.id is not null)
        )
        order by t.sort_order, t.min_amount_usd
      )
      from public.alert_tiers as t
      left join public.alert_settings as ts on ts.tier_id = t.id
      where t.user_id = credentials.creator_id
    ), '[]'::jsonb),
    coalesce(intro.enabled, false),
    coalesce(intro.template, '{name} sent a voice message'),
    -- Clamping here means a creator cannot point the overlay at an engine
    -- value that no code path handles; an unusable engine degrades to the
    -- browser voice rather than to silence.
    case when voices.tts_engine = 'voxcpm' then 'voxcpm' else 'browser' end,
    voices.active_clone_id,
    voices.preset_id,
    coalesce(voices.clone_fallback, true)
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts
    on alerts.user_id = credentials.creator_id
   and alerts.tier_id is null
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  left join public.alert_voice_intro as intro on intro.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated;



