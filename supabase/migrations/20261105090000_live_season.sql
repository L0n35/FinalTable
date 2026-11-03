-- The leaderboard also lists players who are locked in before the first standings update, with no
-- points yet, and says how many players there are so the app can page through big leagues.

begin;

drop function public.league_leaderboard(uuid);

create function public.league_leaderboard(p_league_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  base_points integer,
  bonus_points integer,
  total_points integer,
  exact_count integer,
  rank integer,
  previous_rank integer,
  entry_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  season public.seasons;
  latest_update uuid;
  earlier_update uuid;
begin
  if not private.can_view_league(p_league_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  select s.* into season
  from public.seasons s
  join public.leagues l on l.season_id = s.id
  where l.id = p_league_id;

  -- Who has entered stays hidden until the deadline, along with what they picked.
  if season.status = 'draft' or season.deadline > now() then
    return;
  end if;

  select u.id into latest_update from public.standings_updates u
  where u.season_id = season.id order by u.version desc limit 1;
  select u.id into earlier_update from public.standings_updates u
  where u.season_id = season.id order by u.version desc limit 1 offset 1;

  return query
  with entrants as (
    select m.user_id as member_id, p.id as prediction_id
    from public.memberships m
    join public.predictions p on p.user_id = m.user_id and p.season_id = season.id
    where m.league_id = p_league_id and not p.needs_review
  ),
  latest as (
    select
      entrant.member_id, s.base_points, s.bonus_points, s.exact_count,
      rank() over (
        order by s.base_points + s.bonus_points desc, s.exact_count desc
      )::integer as position
    from entrants entrant
    join public.prediction_scores s
      on s.prediction_id = entrant.prediction_id and s.standings_update_id = latest_update
  ),
  earlier as (
    select
      entrant.member_id,
      rank() over (
        order by s.base_points + s.bonus_points desc, s.exact_count desc
      )::integer as position
    from entrants entrant
    join public.prediction_scores s
      on s.prediction_id = entrant.prediction_id and s.standings_update_id = earlier_update
  )
  select
    entrant.member_id, profile.display_name, profile.avatar_url,
    latest.base_points, latest.bonus_points,
    latest.base_points + latest.bonus_points,
    latest.exact_count, latest.position, earlier.position,
    (count(*) over ())::integer
  from entrants entrant
  join public.profiles profile on profile.id = entrant.member_id
  left join latest on latest.member_id = entrant.member_id
  left join earlier on earlier.member_id = entrant.member_id
  -- The id keeps pages stable when names match.
  order by latest.position nulls last, profile.display_name, entrant.member_id;
end;
$$;

revoke all on function public.league_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.league_leaderboard(uuid) to anon, authenticated;

commit;
