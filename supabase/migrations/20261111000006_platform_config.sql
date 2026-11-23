-- Platform configuration table for storing platform-wide settings
-- Only accessible by service_role and platform admins via RPC

create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.platform_config enable row level security;
revoke all on table public.platform_config from anon, authenticated;
grant select, insert, update on table public.platform_config to service_role;

-- Index for faster lookups
create index platform_config_updated_idx on public.platform_config(updated_at desc);