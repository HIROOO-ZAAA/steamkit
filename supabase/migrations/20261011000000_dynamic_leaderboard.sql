-- Dynamic donor leaderboard: sums every completed tip per backer and ranks them by
-- total descending (Top 1 = highest total). Ranking is recomputed on every call, so a
-- realtime refresh after a new tip immediately re-orders donors.

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
      coalesce(credentials.leaderboard_widget->>'dataSource', 'Top Total (All Time)') as source
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
  grouped as (
    select
      (array_agg(windowed.tipper_name order by windowed.created_at desc))[1] as tipper_name,
      case
        when (select ctx.source from ctx) in ('Top (Session)', 'Top (Weekly)', 'Top (Monthly)')
          then max(windowed.amount)
        else sum(windowed.amount)
      end as total_amount,
      count(*)::bigint as tip_count,
      max(windowed.created_at) as last_tip_at
    from windowed
    group by lower(btrim(windowed.tipper_name))
  ),
  scored as (
    select
      grouped.tipper_name,
      grouped.total_amount,
      grouped.tip_count,
      case
        when (select ctx.source from ctx) = 'Most Recent (History)'
          then extract(epoch from grouped.last_tip_at)
        else grouped.total_amount
      end as sort_score
    from grouped
  )
  select
    scored.tipper_name,
    scored.total_amount,
    scored.tip_count,
    row_number() over (order by scored.sort_score desc, scored.tipper_name asc) as rank
  from scored
  order by scored.sort_score desc, scored.tipper_name asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

revoke all on function public.streamkit_get_leaderboard_dynamic(text, int) from public;
grant execute on function public.streamkit_get_leaderboard_dynamic(text, int) to anon, authenticated;

-- Keep tips in the realtime publication so overlays receive INSERT/UPDATE pushes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tips'
  ) then
    alter publication supabase_realtime add table public.tips;
  end if;
end
$$;
