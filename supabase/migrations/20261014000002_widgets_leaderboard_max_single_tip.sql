-- Leaderboard ranked by single largest tip: each donor is ranked by MAX(amount),
-- never by summed totals. Still honors the widget's Data Source window
-- (week / month / session / all-time) and leaderboard_cleared_at.
-- Same return signature (tipper_name, total_amount, tip_count, rank), so this
-- replaces the summed version in place.

create or replace function public.streamkit_get_leaderboard_dynamic(
  p_token text,
  p_limit int default 10
)
returns table (
  tipper_name text,
  total_amount numeric,
  tip_count bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select
      credentials.creator_id,
      credentials.leaderboard_cleared_at,
      coalesce(credentials.leaderboard_widget->>'dataSource', 'Top (All Time)') as source
    from public.streamkit_overlay_credentials as credentials
    where credentials.token = p_token
  ),
  windowed as (
    select tips.tipper_name, tips.amount, tips.created_at
    from public.tips as tips
    join ctx on true
    where tips.creator_id = ctx.creator_id
      and tips.payment_status in ('successful', 'test')
      and tips.currency = 'USD'
      and tips.created_at > case
        when ctx.source in ('Top (Weekly)', 'Top Total (Weekly)', 'This Week')
          then greatest(coalesce(ctx.leaderboard_cleared_at, '-infinity'::timestamptz), now() - interval '7 days')
        when ctx.source in ('Top (Monthly)', 'Top Total (Monthly)', 'This Month')
          then greatest(coalesce(ctx.leaderboard_cleared_at, '-infinity'::timestamptz), now() - interval '30 days')
        else coalesce(ctx.leaderboard_cleared_at, '-infinity'::timestamptz)
      end
  ),
  per_donor as (
    select
      lower(btrim(windowed.tipper_name)) as name_key,
      (array_agg(windowed.tipper_name order by windowed.created_at desc))[1] as tipper_name,
      max(windowed.amount) as total_amount,
      count(*)::bigint as tip_count,
      max(windowed.created_at) as last_tip_at
    from windowed
    group by lower(btrim(windowed.tipper_name))
  )
  select
    per_donor.tipper_name,
    per_donor.total_amount,
    per_donor.tip_count,
    row_number() over (order by per_donor.total_amount desc, per_donor.tipper_name asc) as rank
  from per_donor
  order by per_donor.total_amount desc, per_donor.tipper_name asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

revoke all on function public.streamkit_get_leaderboard_dynamic(text, int) from public;
grant execute on function public.streamkit_get_leaderboard_dynamic(text, int) to anon, authenticated;