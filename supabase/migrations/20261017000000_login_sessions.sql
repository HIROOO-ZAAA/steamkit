-- Sign-in audit trail: records logged_in_at, logged_out_at, IP and device per session.
-- Inserted only from the service role (api/auth/session-log) so the client cannot forge rows.
-- Read by the owner through the RLS select policy on the settings page.

create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default timezone('utc'::text, now()),
  logged_out_at timestamptz,
  ip_address inet,
  user_agent text,
  device text,
  provider text
);

create index if not exists login_sessions_user_recent_idx
  on public.login_sessions (user_id, logged_in_at desc);

-- Close any still-open session for this user, then bound retention to 180 days.
create or replace function public.streamkit_prepare_login_session()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.login_sessions
  set logged_out_at = coalesce(logged_out_at, timezone('utc'::text, now()))
  where user_id = new.user_id
    and logged_out_at is null;

  delete from public.login_sessions
  where user_id = new.user_id
    and logged_in_at < timezone('utc'::text, now()) - interval '180 days';

  return new;
end;
$$;

drop trigger if exists login_sessions_prepare on public.login_sessions;
create trigger login_sessions_prepare
  before insert on public.login_sessions
  for each row execute function public.streamkit_prepare_login_session();

alter table public.login_sessions enable row level security;

revoke all on table public.login_sessions from anon;
revoke all on table public.login_sessions from authenticated;
grant select on table public.login_sessions to authenticated;
grant all on table public.login_sessions to service_role;

drop policy if exists "Users read own login sessions" on public.login_sessions;
create policy "Users read own login sessions"
  on public.login_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);