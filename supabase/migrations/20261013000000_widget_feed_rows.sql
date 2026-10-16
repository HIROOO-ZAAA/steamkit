-- Combined widget overlay: switch the leaderboard data source from grouped totals to a
-- chronological feed of individual donations (one row per tip, newest first). The combined
-- overlay resolves by widget_token, not token.

drop function if exists public.streamkit_get_widget_leaderboard(text);

create or replace function public.streamkit_get_widget_leaderboard(p_token text)
returns table (
  id uuid,
  tipper_name text,
  total_amount numeric,
  currency text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select
      credentials.creator_id,
      credentials.widget_cleared_at,
      coalesce(credentials.widget_settings->>'dataSource', 'All-Time Top Donors') as source
    from public.streamkit_overlay_credentials as credentials
    where credentials.widget_token = p_token
  )
  select
    tips.id,
    coalesce(nullif(trim(tips.tipper_name), ''), 'Anonymous') as tipper_name,
    tips.amount,
    tips.currency,
    tips.created_at
  from public.tips as tips
  join ctx on true
  where tips.creator_id = ctx.creator_id
    and tips.payment_status in ('successful', 'test')
    and tips.created_at > case
      when ctx.source = 'This Month'
        then greatest(coalesce(ctx.widget_cleared_at, '-infinity'::timestamptz), now() - interval '30 days')
      when ctx.source = 'This Week'
        then greatest(coalesce(ctx.widget_cleared_at, '-infinity'::timestamptz), now() - interval '7 days')
      else coalesce(ctx.widget_cleared_at, '-infinity'::timestamptz)
    end
  order by tips.created_at desc
  limit 10;
$$;

revoke all on function public.streamkit_get_widget_leaderboard(text) from public;
grant execute on function public.streamkit_get_widget_leaderboard(text) to anon, authenticated;