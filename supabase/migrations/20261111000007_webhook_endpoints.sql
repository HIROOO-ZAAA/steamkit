-- Webhook endpoints table for platform integrations
-- Stores configured webhook URLs for event notifications

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  events text[] not null default '{}',
  secret text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.webhook_endpoints enable row level security;
revoke all on table public.webhook_endpoints from anon, authenticated;
grant select, insert, update, delete on table public.webhook_endpoints to service_role;

-- Policy: Only admins can read webhooks (via service_role RPC)
create policy "Webhooks readable by admins"
  on public.webhook_endpoints for select
  using (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role in ('super_admin', 'platform_admin')
      and (pr.expires_at is null or pr.expires_at > now())
    )
  );

-- Policy: Only super_admin/platform_admin can manage webhooks
create policy "Webhooks manageable by admins"
  on public.webhook_endpoints for all
  using (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role in ('super_admin', 'platform_admin')
      and (pr.expires_at is null or pr.expires_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.platform_roles pr
      where pr.user_id = auth.uid()
      and pr.role in ('super_admin', 'platform_admin')
      and (pr.expires_at is null or pr.expires_at > now())
    )
  );

create index webhook_endpoints_active_idx on public.webhook_endpoints(is_active);
create index webhook_endpoints_created_idx on public.webhook_endpoints(created_at desc);