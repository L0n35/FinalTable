-- Conferences: one league whose teams split into separate tables, such as MLS East and West. A player
-- still has one prediction and one place on the leaderboard. Each conference is scored as its own
-- table, using the season's zones, and the points are added up.
--
-- A prediction stays one list of every team, and a conference's table is that list filtered to its
-- teams. So submitting doesn't change, and a season with no divisions works exactly as it did.
--
-- Everything here is additive for the app, so it's safe to run before the code that uses it is deployed.

begin;

-- ---------------------------------------------------------------------------
-- Divisions. On screen these are conferences, and the database keeps the wider word because custom
-- leagues could use them for their own divisions later.
-- ---------------------------------------------------------------------------

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 24),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (season_id, position),
  -- Lets a team's foreign key check that its division is in the same season.
  unique (id, season_id)
);

create unique index divisions_season_name_idx on public.divisions (season_id, lower(name));

alter table public.teams add column division_id uuid;

alter table public.teams add constraint teams_division_in_same_season
  foreign key (division_id, season_id) references public.divisions (id, season_id) on delete cascade;

create index teams_division_idx on public.teams (division_id) where division_id is not null;

-- A team with no conference would be left out of the scoring without anyone noticing.
create function private.check_team_division()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.division_id is null and exists (
    select 1 from public.divisions where season_id = new.season_id
  ) then
    raise exception 'team_needs_division' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teams_check_division
  before insert or update of division_id, season_id on public.teams
  for each row execute function private.check_team_division();

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

-- One conference's table: a full order filtered to that conference's teams.
create function private.order_within_division(p_order uuid[], p_division_id uuid)
returns uuid[]
language sql stable set search_path = ''
as $$
  select coalesce(array_agg(entry.team order by entry.place), '{}')
  from unnest(p_order) with ordinality as entry (team, place)
  where entry.team in (select id from public.teams where division_id = p_division_id);
$$;

-- Scores a whole season: once for a single table, or once per conference with the points added up.
create function private.score_season_prediction(
  p_season public.seasons,
  p_predicted uuid[],
  p_actual uuid[],
  out base_points integer,
  out bonus_points integer,
  out exact_count integer
)
language plpgsql stable set search_path = ''
as $$
declare
  division record;
  part record;
  is_divided boolean := false;
begin
  base_points := 0;
  bonus_points := 0;
  exact_count := 0;

  for division in select id from public.divisions where season_id = p_season.id loop
    is_divided := true;
    select * into part from private.score_prediction(
      private.order_within_division(p_predicted, division.id),
      private.order_within_division(p_actual, division.id),
      p_season.promotion_count, p_season.playoff_from, p_season.playoff_to, p_season.relegation_count
    );
    base_points := base_points + part.base_points;
    bonus_points := bonus_points + part.bonus_points;
    exact_count := exact_count + part.exact_count;
  end loop;

  if not is_divided then
    select * into part from private.score_prediction(
      p_predicted, p_actual,
      p_season.promotion_count, p_season.playoff_from, p_season.playoff_to, p_season.relegation_count
    );
    base_points := part.base_points;
    bonus_points := part.bonus_points;
    exact_count := part.exact_count;
  end if;
end;
$$;

-- Same signature. Only the scoring call changes.
create or replace function public.update_standings(p_season_id uuid, p_team_order uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  season public.seasons;
  previous_update public.standings_updates;
  new_update_id uuid;
begin
  -- The row lock makes concurrent updates take turns, so versions stay in order.
  select * into season from public.seasons where id = p_season_id for update;
  if not found or not private.is_season_manager(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if season.status <> 'published' then
    raise exception 'league_not_live' using errcode = '42501';
  end if;
  if season.deadline > now() then
    raise exception 'deadline_not_reached' using errcode = '42501';
  end if;
  if not private.is_complete_order(p_season_id, p_team_order) then
    raise exception 'invalid_team_order' using errcode = '22023';
  end if;

  select * into previous_update from public.standings_updates
  where season_id = p_season_id
  order by version desc
  limit 1;

  insert into public.standings_updates (season_id, version, team_order, updated_by)
  values (p_season_id, coalesce(previous_update.version, 0) + 1, p_team_order, auth.uid())
  returning id into new_update_id;

  insert into public.prediction_scores (
    prediction_id, standings_update_id, base_points, bonus_points, exact_count
  )
  select p.id, new_update_id, s.base_points, s.bonus_points, s.exact_count
  from public.predictions p
  cross join lateral private.score_season_prediction(season, p.team_order, p_team_order) s
  where p.season_id = p_season_id and not p.needs_review;

  -- Only the latest two sets of scores are needed, for rank movement. This keeps the database small.
  delete from public.prediction_scores
  where standings_update_id in (
    select id from public.standings_updates
    where season_id = p_season_id
      and id <> new_update_id
      and id is distinct from previous_update.id
  );

  return new_update_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- A copied season also keeps its conferences.
-- ---------------------------------------------------------------------------

create or replace function public.create_official_season(
  p_sport text,
  p_competition text,
  p_label text,
  p_team_count integer,
  p_deadline timestamptz,
  p_copy_from uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  sport_id_found uuid;
  competition_id_found uuid;
  new_season uuid;
  new_league uuid;
  source public.seasons;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;

  select id into sport_id_found from public.sports where lower(name) = lower(trim(p_sport));
  if not found then
    insert into public.sports (name) values (trim(p_sport)) returning id into sport_id_found;
  end if;

  select id into competition_id_found from public.competitions
  where sport_id = sport_id_found and lower(name) = lower(trim(p_competition));
  if not found then
    insert into public.competitions (sport_id, name)
    values (sport_id_found, trim(p_competition))
    returning id into competition_id_found;
  end if;

  if exists (
    select 1 from public.seasons
    where competition_id = competition_id_found and lower(label) = lower(trim(p_label))
  ) then
    raise exception 'season_already_exists' using errcode = '23505';
  end if;

  if p_copy_from is not null then
    select * into source from public.seasons
    where id = p_copy_from and competition_id = competition_id_found;
    if not found then
      raise exception 'season_to_copy_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.seasons (
    competition_id, label, team_count, deadline,
    promotion_count, playoff_from, playoff_to, relegation_count,
    promotion_label, playoff_label, relegation_label
  )
  values (
    competition_id_found, trim(p_label), coalesce(source.team_count, p_team_count), p_deadline,
    coalesce(source.promotion_count, 0), source.playoff_from, source.playoff_to,
    coalesce(source.relegation_count, 0),
    coalesce(source.promotion_label, 'Promoted'),
    coalesce(source.playoff_label, 'Playoffs'),
    coalesce(source.relegation_label, 'Relegated')
  )
  returning id into new_season;

  if p_copy_from is not null then
    insert into public.divisions (season_id, name, position)
    select new_season, name, position from public.divisions where season_id = p_copy_from;

    insert into public.teams (
      season_id, name, short_name, logo_path, colour_primary, colour_secondary, division_id
    )
    select
      new_season, team.name, team.short_name, team.logo_path, team.colour_primary,
      team.colour_secondary, copied.id
    from public.teams team
    left join public.divisions original on original.id = team.division_id
    left join public.divisions copied
      on copied.season_id = new_season and copied.position = original.position
    where team.season_id = p_copy_from;
  end if;

  insert into public.leagues (name, type, season_id, created_by)
  values (left(trim(p_competition) || ' ' || trim(p_label), 60), 'official', new_season, null)
  returning id into new_league;
  return new_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- The directory names a league's conferences, and gives the crowd's pick for each. The first team in a
-- full order says nothing about the other conferences, so a divided season has its own crowd figures.
-- ---------------------------------------------------------------------------

drop function public.public_directory();

create function public.public_directory()
returns table (
  competition_id uuid,
  competition_name text,
  sport text,
  accent text,
  sort_order integer,
  state text,
  opens_note text,
  league_id uuid,
  slug text,
  season_id uuid,
  season_label text,
  team_count integer,
  deadline timestamptz,
  entrant_count integer,
  crowd_team text,
  crowd_percent integer,
  leader_name text,
  leader_points integer,
  badges jsonb,
  division_names text[],
  crowd_picks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with listed as (
    select
      c.id as competition_id, c.name as competition_name, sp.name as sport, c.accent, c.sort_order,
      l.id as league_id, l.slug, s.id as season_id, s.label, s.team_count, s.deadline,
      case
        when s.status = 'finished' then 'finished'
        when s.deadline > now() then 'open'
        else 'live'
      end as state
    from public.leagues l
    join public.seasons s on s.id = l.season_id
    join public.competitions c on c.id = s.competition_id
    join public.sports sp on sp.id = c.sport_id
    where l.type = 'official' and l.hidden_at is null and s.status <> 'draft'
  ),
  entries as (
    select p.season_id, count(*)::integer as total
    from public.predictions p
    where not p.needs_review and p.season_id in (select listed.season_id from listed)
    group by p.season_id
  ),
  top_picks as (
    select distinct on (vote.season_id) vote.season_id, t.name, vote.votes
    from (
      select p.season_id, p.team_order[1] as team_id, count(*)::integer as votes
      from public.predictions p
      where not p.needs_review
        and p.season_id in (select listed.season_id from listed)
        and not exists (select 1 from public.divisions d where d.season_id = p.season_id)
      group by p.season_id, p.team_order[1]
    ) vote
    join public.teams t on t.id = vote.team_id
    order by vote.season_id, vote.votes desc, t.name
  ),
  division_firsts as (
    select d.id as division_id, d.season_id, d.name as division_name, d.position, first_pick.team_name
    from public.divisions d
    join public.predictions p on p.season_id = d.season_id and not p.needs_review
    cross join lateral (
      select t.name as team_name
      from unnest(p.team_order) with ordinality as entry (team, place)
      join public.teams t on t.id = entry.team
      where t.division_id = d.id
      order by entry.place
      limit 1
    ) first_pick
    where d.season_id in (select listed.season_id from listed)
  ),
  division_picks as (
    select distinct on (vote.division_id)
      vote.season_id, vote.division_name, vote.position, vote.team_name, vote.votes
    from (
      select
        first.division_id, first.season_id, first.division_name, first.position, first.team_name,
        count(*)::integer as votes
      from division_firsts first
      group by first.division_id, first.season_id, first.division_name, first.position, first.team_name
    ) vote
    order by vote.division_id, vote.votes desc, vote.team_name
  ),
  crowd_by_division as (
    select
      pick.season_id,
      jsonb_agg(
        jsonb_build_object(
          'division', pick.division_name,
          'team', pick.team_name,
          'percent', (round(pick.votes * 100.0 / entries.total / 5) * 5)::integer
        )
        order by pick.position
      ) as picks
    from division_picks pick
    join entries on entries.season_id = pick.season_id and entries.total >= 10
    group by pick.season_id
  ),
  latest_updates as (
    select distinct on (u.season_id) u.season_id, u.id
    from public.standings_updates u
    where u.season_id in (select listed.season_id from listed)
    order by u.season_id, u.version desc
  ),
  leaders as (
    select distinct on (listed.league_id)
      listed.league_id, profile.display_name, score.base_points + score.bonus_points as points
    from listed
    join latest_updates latest on latest.season_id = listed.season_id
    join public.prediction_scores score on score.standings_update_id = latest.id
    join public.predictions p on p.id = score.prediction_id
    join public.memberships m on m.league_id = listed.league_id and m.user_id = p.user_id
    join public.profiles profile on profile.id = p.user_id
    order by
      listed.league_id, score.base_points + score.bonus_points desc, score.exact_count desc,
      profile.display_name
  )
  select
    listed.competition_id, listed.competition_name, listed.sport, listed.accent, listed.sort_order,
    listed.state, null::text, listed.league_id, listed.slug, listed.season_id, listed.label,
    listed.team_count, listed.deadline,
    case
      when listed.state = 'open' and coalesce(entries.total, 0) < 10 then null
      else coalesce(entries.total, 0)
    end,
    case when coalesce(entries.total, 0) >= 10 then top_picks.name end,
    case
      when coalesce(entries.total, 0) >= 10
      then (round(top_picks.votes * 100.0 / entries.total / 5) * 5)::integer
    end,
    leaders.display_name,
    leaders.points,
    (
      select jsonb_agg(badge.* order by badge.name)
      from (
        select t.name, t.short_name, t.logo_path, t.colour_primary, t.colour_secondary
        from public.teams t
        where t.season_id = listed.season_id
        order by t.name
        limit 6
      ) badge
    ),
    (
      select array_agg(d.name order by d.position)
      from public.divisions d
      where d.season_id = listed.season_id
    ),
    crowd_by_division.picks
  from listed
  left join entries on entries.season_id = listed.season_id
  left join top_picks on top_picks.season_id = listed.season_id
  left join leaders on leaders.league_id = listed.league_id
  left join crowd_by_division on crowd_by_division.season_id = listed.season_id
  union all
  select
    c.id, c.name, sp.name, c.accent, c.sort_order, 'coming_soon', c.opens_note,
    null::uuid, null::text, null::uuid, null::text, null::integer, null::timestamptz, null::integer,
    null::text, null::integer, null::text, null::integer, null::jsonb, null::text[], null::jsonb
  from public.competitions c
  join public.sports sp on sp.id = c.sport_id
  where c.opens_note is not null
    and not exists (
      select 1 from listed where listed.competition_id = c.id and listed.state = 'open'
    );
$$;

-- ---------------------------------------------------------------------------
-- Row security and privileges
-- ---------------------------------------------------------------------------

alter table public.divisions enable row level security;

create policy "divisions of visible seasons are readable" on public.divisions
  for select to anon, authenticated using (private.can_view_season(season_id));

revoke all on public.divisions from public, anon, authenticated;
grant select on public.divisions to anon, authenticated;

revoke all on function private.check_team_division() from public, anon, authenticated;
revoke all on function private.order_within_division(uuid[], uuid) from public, anon, authenticated;
revoke all on function private.score_season_prediction(public.seasons, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.public_directory() from public, anon, authenticated;
grant execute on function public.public_directory() to anon, authenticated;

commit;
