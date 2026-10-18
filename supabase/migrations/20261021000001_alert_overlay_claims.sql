-- The overlay uses this existing flag as an atomic, cross-instance alert claim.
-- The schema snapshot already contains it; this repairs databases where the
-- corresponding migration was missed. Reapplying it is safe.
alter table public.tips
  add column if not exists played_in_overlay boolean not null default false;
