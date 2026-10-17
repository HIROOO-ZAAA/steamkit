alter table public.alert_settings add column if not exists donor_avatar text;
alter table public.alert_settings add column if not exists text_delay integer not null default 0;

drop function if exists public.streamkit_resolve_overlay(text);

create function public.streamkit_resolve_overlay(p_token text)
returns table (
  creator_id uuid,
  duration_seconds integer,
  sound_url text,
  animation_type text,
  font_color text,
  tts_enabled boolean,
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
  donor_avatar text
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
    coalesce(alerts.donor_avatar, '🦔')
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts on alerts.user_id = credentials.creator_id
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated;
