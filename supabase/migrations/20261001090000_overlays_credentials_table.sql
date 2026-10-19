create table if not exists public.streamkit_overlay_credentials (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  token text unique not null default gen_random_uuid()::text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.streamkit_overlay_credentials enable row level security;

revoke all on table public.streamkit_overlay_credentials from anon, authenticated;
grant select, insert, update on table public.streamkit_overlay_credentials to authenticated;

drop policy if exists "Creators manage own overlay credential" on public.streamkit_overlay_credentials;
create policy "Creators manage own overlay credential"
  on public.streamkit_overlay_credentials
  for all to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

do $migration$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'overlay_token'
  ) then
    execute $copy$
      insert into public.streamkit_overlay_credentials (creator_id, token)
      select id, overlay_token::text
      from public.profiles
      where overlay_token is not null
      on conflict (creator_id) do update set token = excluded.token
    $copy$;

    alter table public.profiles drop column overlay_token;
  end if;
end
$migration$;

create or replace function public.streamkit_resolve_overlay(p_token text)
returns table (
  creator_id uuid,
  duration_seconds integer,
  sound_url text,
  animation_type text,
  font_color text,
  tts_enabled boolean,
  language text,
  pitch numeric,
  speed numeric
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
    coalesce(voices.speed, 1.0)
  from public.streamkit_overlay_credentials as credentials
  left join public.alert_settings as alerts on alerts.user_id = credentials.creator_id
  left join public.voice_settings as voices on voices.user_id = credentials.creator_id
  where credentials.token = p_token;
$function$;

revoke all on function public.streamkit_resolve_overlay(text) from public;
grant execute on function public.streamkit_resolve_overlay(text) to anon, authenticated, service_role;