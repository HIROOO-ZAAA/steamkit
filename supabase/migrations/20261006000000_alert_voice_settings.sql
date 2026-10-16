create table if not exists public.alert_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  duration_seconds integer not null default 6,
  sound_url text not null default 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  animation_type text not null default 'bounce',
  font_color text not null default '#10b981',
  tts_enabled boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.alert_settings add column if not exists layout text not null default 'image_top';
alter table public.alert_settings add column if not exists image_url text;
alter table public.alert_settings add column if not exists image_scale integer not null default 50;
alter table public.alert_settings add column if not exists show_donor_profile boolean not null default true;
alter table public.alert_settings add column if not exists message_template text not null default 'អរគុណ {name} សម្រាប់ការឧបត្ថម {amount}{currency}';
alter table public.alert_settings add column if not exists text_color text not null default '#ffffff';
alter table public.alert_settings add column if not exists bg_color text not null default '#000000';
alter table public.alert_settings add column if not exists enable_card boolean not null default false;
alter table public.alert_settings add column if not exists font_family text not null default '''Noto Sans Khmer'', sans-serif';
alter table public.alert_settings add column if not exists font_size integer not null default 36;
alter table public.alert_settings add column if not exists font_weight text not null default '700';
alter table public.alert_settings add column if not exists text_animation text not null default 'wiggle';
alter table public.alert_settings add column if not exists alert_animation text not null default 'bounceIn';
alter table public.alert_settings add column if not exists updated_at timestamp with time zone not null default timezone('utc'::text, now());

alter table public.alert_settings enable row level security;

grant select, insert, update on table public.alert_settings to authenticated;

drop policy if exists "Users manage own alert settings" on public.alert_settings;
create policy "Users manage own alert settings"
  on public.alert_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.voice_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  language text not null default 'km-KH',
  pitch numeric not null default 1.0,
  speed numeric not null default 1.0,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.voice_settings enable row level security;

grant select, insert, update on table public.voice_settings to authenticated;

drop policy if exists "Users manage own voice settings" on public.voice_settings;
create policy "Users manage own voice settings"
  on public.voice_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
  alert_animation text
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
    coalesce(alerts.message_template, 'អរគុណ {name} សម្រាប់ការឧបត្ថម {amount}{currency}'),
    coalesce(alerts.text_color, '#ffffff'),
    coalesce(alerts.bg_color, '#000000'),
    coalesce(alerts.enable_card, false),
    coalesce(alerts.font_family, '''Noto Sans Khmer'', sans-serif'),
    coalesce(alerts.font_size, 36),
    coalesce(alerts.font_weight, '700'),
    coalesce(alerts.text_animation, 'wiggle'),
    coalesce(alerts.alert_animation, 'bounceIn')
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts on alerts.user_id = credentials.creator_id
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated;