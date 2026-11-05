-- One time only: turns MLS East and MLS West into one MLS league with two conferences, and makes NBA
-- East and West one coming-soon NBA. Run it in the SQL Editor once the conferences migration has run
-- and its code is deployed.
--
-- It checks everything first and runs in one transaction, so a failure changes nothing.
--
-- What happens to people:
-- - Entered both conferences: their two tables become one prediction, and it still counts.
-- - Entered one conference: they keep that table, the other conference starts in alphabetical order,
--   and they're asked to review it. A table waiting for review doesn't score until they submit it.
-- - Groups playing MLS West move across with their members, so every MLS group shares one season.
-- - Anyone who joined either global league stays in the merged one.

begin;

drop table if exists pg_temp.merge_summary;
create temporary table merge_summary (step integer, what text, how_many integer);

do $$
declare
  east public.seasons;
  west public.seasons;
  east_league public.leagues;
  west_league public.leagues;
  mls uuid;
  east_division uuid;
  west_division uuid;
  east_teams uuid[];
  west_teams uuid[];
  touched integer;
begin
  select s.* into east
  from public.seasons s
  join public.competitions c on c.id = s.competition_id
  where c.name = 'MLS East' and s.label = '2027 Sprint'
  for update of s;

  select s.* into west
  from public.seasons s
  join public.competitions c on c.id = s.competition_id
  where c.name = 'MLS West' and s.label = '2027 Sprint'
  for update of s;

  if east.id is null or west.id is null then
    raise exception 'MLS East and MLS West 2027 Sprint were not both found. Has this already been run?';
  end if;
  if east.status <> 'published' or west.status <> 'published' then
    raise exception 'Both MLS seasons need to be published.';
  end if;
  if east.deadline <= now() or west.deadline <= now() then
    raise exception 'MLS has already locked, so its tables can no longer be merged.';
  end if;
  if east.deadline <> west.deadline then
    raise exception 'MLS East and West lock at different times. Make them match on the setup page first.';
  end if;
  if (east.promotion_count, east.playoff_from, east.playoff_to, east.relegation_count,
      east.promotion_label, east.playoff_label, east.relegation_label)
    is distinct from
     (west.promotion_count, west.playoff_from, west.playoff_to, west.relegation_count,
      west.promotion_label, west.playoff_label, west.relegation_label) then
    raise exception 'MLS East and West have different zones. Make them match on the setup page first.';
  end if;
  if exists (select 1 from public.standings_updates where season_id in (east.id, west.id)) then
    raise exception 'MLS already has standings, so its tables can no longer be merged.';
  end if;
  if exists (select 1 from public.divisions where season_id in (east.id, west.id)) then
    raise exception 'MLS already has conferences. Has this already been run?';
  end if;

  select * into east_league from public.leagues where season_id = east.id and type = 'official';
  select * into west_league from public.leagues where season_id = west.id and type = 'official';
  if east_league.hidden_at is not null or west_league.hidden_at is not null then
    raise exception 'An MLS league is hidden. Unhide it on the Admin page first.';
  end if;

  -- The competition. It takes MLS East's sport, which is Football.
  insert into public.competitions (sport_id, name, accent, sort_order, opens_note)
  select c.sport_id, 'MLS', c.accent, c.sort_order, c.opens_note
  from public.competitions c
  where c.id = east.competition_id
  returning id into mls;

  -- The conferences and their teams. West's teams keep their ids, so nothing that points at them breaks.
  insert into public.divisions (season_id, name, position)
  values (east.id, 'East', 1)
  returning id into east_division;
  insert into public.divisions (season_id, name, position)
  values (east.id, 'West', 2)
  returning id into west_division;

  select array_agg(id order by name) into east_teams from public.teams where season_id = east.id;
  select array_agg(id order by name) into west_teams from public.teams where season_id = west.id;

  update public.teams set division_id = east_division where season_id = east.id;
  update public.teams set season_id = east.id, division_id = west_division where season_id = west.id;

  -- Entered both.
  update public.predictions e
  set
    team_order = e.team_order || w.team_order,
    needs_review = e.needs_review or w.needs_review,
    submitted_at = greatest(e.submitted_at, w.submitted_at)
  from public.predictions w
  where e.season_id = east.id and w.season_id = west.id and w.user_id = e.user_id;
  get diagnostics touched = row_count;
  insert into merge_summary values (1, 'Players who entered both, now one prediction', touched);

  -- Entered East only.
  update public.predictions e
  set team_order = e.team_order || west_teams, needs_review = true
  where e.season_id = east.id
    and not exists (
      select 1 from public.predictions w where w.season_id = west.id and w.user_id = e.user_id
    );
  get diagnostics touched = row_count;
  insert into merge_summary values (2, 'Players who entered East only, asked to review', touched);

  -- Entered West only.
  update public.predictions w
  set season_id = east.id, team_order = east_teams || w.team_order, needs_review = true
  where w.season_id = west.id
    and not exists (
      select 1 from public.predictions e where e.season_id = east.id and e.user_id = w.user_id
    );
  get diagnostics touched = row_count;
  insert into merge_summary values (3, 'Players who entered West only, asked to review', touched);

  -- What's left on West is the half already merged in above.
  delete from public.predictions where season_id = west.id;

  -- People and groups.
  insert into public.memberships (league_id, user_id, role, joined_at)
  select east_league.id, m.user_id, m.role, m.joined_at
  from public.memberships m
  where m.league_id = west_league.id
  on conflict (league_id, user_id) do nothing;
  get diagnostics touched = row_count;
  insert into merge_summary values (4, 'Members moved from the MLS West league', touched);

  update public.leagues set season_id = east.id where season_id = west.id and type <> 'official';
  get diagnostics touched = row_count;
  insert into merge_summary values (5, 'Groups moved from MLS West', touched);

  -- Someone can only have one open report on a league, so an identical one on West goes.
  delete from public.reports w
  using public.reports e
  where w.league_id = west_league.id
    and e.league_id = east_league.id
    and w.status = 'open'
    and e.status = 'open'
    and w.reported_by = e.reported_by
    and coalesce(w.team_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(e.team_id, '00000000-0000-0000-0000-000000000000'::uuid);
  update public.reports set league_id = east_league.id where league_id = west_league.id;
  get diagnostics touched = row_count;
  insert into merge_summary values (6, 'Reports moved from the MLS West league', touched);

  delete from public.leagues where id = west_league.id;

  -- The merged season and its league. Old links are redirected by the league page.
  update public.seasons
  set competition_id = mls, team_count = coalesce(array_length(east_teams, 1), 0) + coalesce(array_length(west_teams, 1), 0)
  where id = east.id;
  update public.leagues
  set name = 'MLS ' || east.label, slug = 'mls-' || lower(replace(east.label, ' ', '-'))
  where id = east_league.id;

  delete from public.seasons where id = west.id;
  delete from public.competitions where id in (east.competition_id, west.competition_id);

  -- NBA hasn't started, so there are only its coming-soon entries to combine.
  if exists (
    select 1 from public.seasons s
    join public.competitions c on c.id = s.competition_id
    where c.name in ('NBA East', 'NBA West')
  ) then
    raise exception 'NBA East or West already has a season, which this does not know how to merge.';
  end if;
  insert into public.competitions (sport_id, name, accent, sort_order, opens_note)
  select c.sport_id, 'NBA', c.accent, c.sort_order, c.opens_note
  from public.competitions c
  where c.name = 'NBA East';
  delete from public.competitions where name in ('NBA East', 'NBA West');

  -- Nothing is committed unless all of this holds.
  if (select count(*) from public.teams where season_id = east.id and division_id is null) > 0 then
    raise exception 'A team was left without a conference.';
  end if;
  if (select team_count from public.seasons where id = east.id)
    <> (select count(*) from public.teams where season_id = east.id) then
    raise exception 'The team count does not match.';
  end if;
  if exists (
    select 1 from public.predictions
    where season_id = east.id and not needs_review and not private.is_complete_order(east.id, team_order)
  ) then
    raise exception 'A counted prediction would be missing teams.';
  end if;

  select count(*) into touched from public.teams where season_id = east.id;
  insert into merge_summary values (7, 'Teams in the merged MLS league', touched);
end;
$$;

commit;

select what, how_many from merge_summary order by step;
