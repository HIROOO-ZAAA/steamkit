-- Audit log table for platform admin actions
-- Records every mutation to sensitive tables (payment config, donation photos, role changes)

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create index audit_log_actor_idx on public.audit_log(actor_id);
create index audit_log_action_idx on public.audit_log(action);
create index audit_log_resource_idx on public.audit_log(resource_type, resource_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to service_role;