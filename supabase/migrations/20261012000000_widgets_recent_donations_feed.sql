-- Recent donations feed: every tip is its own event, newest first (no grouping/summing),
-- so the OBS ticker shows each donation as a separate row.

create or replace function public.streamkit_get_recent_tips(
  p_token text,
  p_limit int default 10
)
returns table (
  id uuid,
  tipper_name text,
  amount numeric,
  currency text,
  message text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    tips.id,
    tips.tipper_name,
    tips.amount,
    tips.currency,
    tips.message,
    tips.created_at
  from public.tips as tips
  where tips.payment_status in ('successful', 'test')
    and exists (
      select 1
      from public.streamkit_overlay_credentials as credentials
      where credentials.token = p_token
        and credentials.creator_id = tips.creator_id
    )
  order by tips.created_at desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

revoke all on function public.streamkit_get_recent_tips(text, int) from public;
grant execute on function public.streamkit_get_recent_tips(text, int) to anon, authenticated;
