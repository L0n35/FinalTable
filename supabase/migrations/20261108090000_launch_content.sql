-- What the launch needs: a look for each competition, wording for zones and short team codes, guest
-- players with no login, and public read functions for the home and Explore pages. Everything here
-- is additive for the app, so it's safe to run before the code that uses it is deployed.

begin;

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

alter table public.competitions
  add column accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  add column sort_order integer not null default 100,
  add column opens_note text check (char_length(opens_note) <= 80);

alter table public.seasons
  add column promotion_label text not null default 'Promoted'
    check (char_length(trim(promotion_label)) between 1 and 24),
  add column playoff_label text not null default 'Playoffs'
    check (char_length(trim(playoff_label)) between 1 and 24),
  add column relegation_label text not null default 'Relegated'
    check (char_length(trim(relegation_label)) between 1 and 24);

alter table public.teams
  add column short_name text check (short_name ~ '^[A-Z0-9]{2,4}$');

-- ---------------------------------------------------------------------------
-- Guest players: someone whose table an admin added for them, with no login. They're profiles with
-- no matching auth user, so the foreign key gives way to a trigger that does the same clean-up.
-- ---------------------------------------------------------------------------

alter table public.profiles add column is_guest boolean not null default false;
alter table public.profiles drop constraint profiles_id_fkey;

create function private.handle_deleted_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.handle_deleted_user();

-- ---------------------------------------------------------------------------
-- Read model. Replacing a view resets its options, so security_invoker must be restated, and new
-- columns can only go on the end.
-- ---------------------------------------------------------------------------

create or replace view public.league_details with (security_invoker = true) as
select
  l.id,
  l.slug,
  l.join_code,
  l.type,
  l.name,
  l.created_by,
  l.hidden_at,
  l.season_id,
  s.team_count,
  s.deadline,
  s.promotion_count,
  s.playoff_from,
  s.playoff_to,
  s.relegation_count,
  s.status,
  s.finished_at,
  s.competition_id,
  s.label as season_label,
  c.name as competition_name,
  coalesce(sp.name, s.sport_label) as sport,
  s.promotion_label,
  s.playoff_label,
  s.relegation_label,
  c.accent as competition_accent
from public.leagues l
join public.seasons s on s.id = l.season_id
left join public.competitions c on c.id = s.competition_id
left join public.sports sp on sp.id = c.sport_id;

-- ---------------------------------------------------------------------------
-- A copied season also keeps its zone wording and team codes.
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
    insert into public.teams (season_id, name, short_name, logo_path, colour_primary, colour_secondary)
    select new_season, name, short_name, logo_path, colour_primary, colour_secondary
    from public.teams where season_id = p_copy_from;
  end if;

  insert into public.leagues (name, type, season_id, created_by)
  values (left(trim(p_competition) || ' ' || trim(p_label), 60), 'official', new_season, null)
  returning id into new_league;
  return new_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public read functions. These never look at who's asking, so their answers can be cached and shared.
-- ---------------------------------------------------------------------------

-- Every global league, plus a coming-soon row for a competition with a note and nothing open. Crowd
-- figures need 10 entrants and are rounded to 5%, so nobody can work out a newcomer's pick by watching
-- a percentage change.
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
  badges jsonb
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
      where not p.needs_review and p.season_id in (select listed.season_id from listed)
      group by p.season_id, p.team_order[1]
    ) vote
    join public.teams t on t.id = vote.team_id
    order by vote.season_id, vote.votes desc, t.name
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
    )
  from listed
  left join entries on entries.season_id = listed.season_id
  left join top_picks on top_picks.season_id = listed.season_id
  left join leaders on leaders.league_id = listed.league_id
  union all
  select
    c.id, c.name, sp.name, c.accent, c.sort_order, 'coming_soon', c.opens_note,
    null::uuid, null::text, null::uuid, null::text, null::integer, null::timestamptz, null::integer,
    null::text, null::integer, null::text, null::integer, null::jsonb
  from public.competitions c
  join public.sports sp on sp.id = c.sport_id
  where c.opens_note is not null
    and not exists (
      select 1 from listed where listed.competition_id = c.id and listed.state = 'open'
    );
$$;

-- Public groups, biggest first. Search and limit are parameters, because filtering a function's
-- result afterwards would still do all the work. Counts people but never says who has entered.
create function public.public_groups(
  p_query text default null,
  p_min_players integer default 1,
  p_limit integer default 30
)
returns table (
  league_id uuid,
  slug text,
  name text,
  competition_name text,
  sport text,
  team_count integer,
  deadline timestamptz,
  state text,
  player_count integer
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id, l.slug, l.name, c.name, coalesce(sp.name, s.sport_label), s.team_count, s.deadline,
    case
      when s.status = 'finished' then 'finished'
      when s.deadline > now() then 'open'
      else 'live'
    end,
    players.total
  from public.leagues l
  join public.seasons s on s.id = l.season_id
  left join public.competitions c on c.id = s.competition_id
  left join public.sports sp on sp.id = c.sport_id
  cross join lateral (
    select count(*)::integer as total
    from public.memberships m
    where m.league_id = l.id and m.role = 'player'
  ) players
  where l.type = 'public'
    and l.hidden_at is null
    and s.status <> 'draft'
    and players.total >= greatest(p_min_players, 1)
    -- Plain text matching, so % and _ in a search aren't treated as wildcards.
    and (
      nullif(trim(p_query), '') is null
      or position(lower(trim(p_query)) in lower(l.name)) > 0
    )
  order by players.total desc, l.name, l.id
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function private.handle_deleted_user() from public, anon, authenticated;
revoke all on function public.public_directory() from public, anon, authenticated;
revoke all on function public.public_groups(text, integer, integer) from public, anon, authenticated;
grant execute on function public.public_directory() to anon, authenticated;
grant execute on function public.public_groups(text, integer, integer) to anon, authenticated;

commit;
