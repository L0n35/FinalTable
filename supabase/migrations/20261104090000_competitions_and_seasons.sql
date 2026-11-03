-- Competitions and seasons.
--
-- A season is the thing being predicted: it holds the teams, deadline, zones and standings.
-- A league is a group of people playing a season. Each competition season has one ownerless
-- official league, and friends' leagues attach to the same season, so standings reach them all
-- and each player has one prediction per season. A custom league gets its own hidden season.
--
-- Existing seasons reuse their league's id, so team logos stored under <league id>/ stay valid.

begin;

-- ---------------------------------------------------------------------------
-- Clear everything built on the old shape
-- ---------------------------------------------------------------------------

do $$
declare
  policy record;
begin
  for policy in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', policy.policyname, policy.tablename);
  end loop;
end;
$$;

drop policy "creators upload team logos" on storage.objects;
drop policy "creators see their team logo files" on storage.objects;
drop policy "creators remove team logos" on storage.objects;

drop trigger leagues_before_insert on public.leagues;
drop trigger leagues_after_insert on public.leagues;
drop trigger leagues_before_update on public.leagues;
drop trigger teams_after_set_change on public.teams;

drop function public.current_user_is_admin();
drop function public.save_league_teams(uuid, integer, jsonb);
drop function public.get_league_preview(text);
drop function public.join_league(uuid, text);
drop function public.submit_prediction(uuid, uuid[]);
drop function public.publish_league(uuid);
drop function public.rotate_join_code(uuid);
drop function public.update_standings(uuid, uuid[]);
drop function public.finish_league(uuid);
drop function public.reopen_league(uuid);
drop function public.set_league_hidden(uuid, boolean);
drop function private.can_edit_logo_path(text);
drop function private.before_league_insert();
drop function private.after_league_insert();
drop function private.before_league_update();
drop function private.after_team_set_change();
drop function private.picks_revealed(uuid);
drop function private.is_complete_order(uuid, uuid[]);
drop function private.can_edit_league(uuid);
drop function private.can_view_league(uuid);
drop function private.is_member(uuid);

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

alter type public.league_type rename value 'host' to 'official';

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index sports_name_idx on public.sports (lower(name));

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index competitions_name_idx on public.competitions (sport_id, lower(name));

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions (id) on delete restrict,
  label text check (char_length(trim(label)) between 1 and 20),
  sport_label text check (char_length(sport_label) <= 40),
  team_count integer not null check (team_count between 4 and 40),
  deadline timestamptz not null,
  promotion_count integer not null default 0 check (promotion_count >= 0),
  playoff_from integer,
  playoff_to integer,
  relegation_count integer not null default 0 check (relegation_count >= 0),
  status public.league_status not null default 'draft',
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint season_label_matches_competition check ((competition_id is null) = (label is null)),
  constraint playoff_range_complete check ((playoff_from is null) = (playoff_to is null)),
  constraint playoff_range_ordered check (playoff_from <= playoff_to),
  constraint zones_fit check (promotion_count + relegation_count <= team_count),
  constraint playoff_between_zones check (
    playoff_from is null
    or (playoff_from > promotion_count and playoff_to <= team_count - relegation_count)
  ),
  unique (competition_id, label)
);

-- ---------------------------------------------------------------------------
-- Move existing data across
-- ---------------------------------------------------------------------------

insert into public.seasons (
  id, sport_label, team_count, deadline, promotion_count, playoff_from, playoff_to,
  relegation_count, status, finished_at, created_at
)
select
  id, sport, team_count, deadline, promotion_count, playoff_from, playoff_to,
  relegation_count, status, finished_at, created_at
from public.leagues;

-- Old host leagues become official: they need a competition, and they lose their owner.
insert into public.sports (name)
select distinct on (lower(coalesce(sport, 'Other'))) coalesce(sport, 'Other')
from public.leagues
where type = 'official'
order by lower(coalesce(sport, 'Other'));

insert into public.competitions (sport_id, name)
select distinct on (s.id, lower(l.name)) s.id, l.name
from public.leagues l
join public.sports s on lower(s.name) = lower(coalesce(l.sport, 'Other'))
where l.type = 'official'
order by s.id, lower(l.name);

update public.seasons season
set
  competition_id = c.id,
  label = to_char(old.deadline, 'YYYY') || case when old.duplicate > 1 then '-' || old.duplicate else '' end,
  sport_label = null
from (
  select l.*, row_number() over (partition by lower(coalesce(l.sport, 'Other')), lower(l.name) order by l.created_at) as duplicate
  from public.leagues l
  where l.type = 'official'
) old
join public.sports s on lower(s.name) = lower(coalesce(old.sport, 'Other'))
join public.competitions c on c.sport_id = s.id and lower(c.name) = lower(old.name)
where season.id = old.id;

delete from public.memberships m
using public.leagues l
where m.league_id = l.id
  and l.type = 'official'
  and m.user_id = l.created_by
  and not exists (
    select 1 from public.predictions p where p.league_id = l.id and p.user_id = m.user_id
  );

-- ---------------------------------------------------------------------------
-- Reshape existing tables
-- ---------------------------------------------------------------------------

alter table public.leagues add column season_id uuid references public.seasons (id) on delete cascade;
update public.leagues set season_id = id;
update public.leagues set created_by = null where type = 'official';
alter table public.leagues alter column season_id set not null;

alter table public.leagues
  drop column sport,
  drop column team_count,
  drop column deadline,
  drop column promotion_count,
  drop column playoff_from,
  drop column playoff_to,
  drop column relegation_count,
  drop column status,
  drop column finished_at;

alter table public.leagues add constraint official_leagues_have_no_owner
  check (type <> 'official' or created_by is null);
create unique index one_official_league_per_season on public.leagues (season_id)
  where type = 'official';
create index leagues_season_idx on public.leagues (season_id);
create index leagues_directory_idx on public.leagues (type, name) where hidden_at is null;

alter table public.teams drop constraint teams_league_id_fkey;
alter table public.teams rename column league_id to season_id;
alter table public.teams add foreign key (season_id) references public.seasons (id) on delete cascade;
alter index public.teams_league_name_idx rename to teams_season_name_idx;

alter table public.predictions drop constraint predictions_league_id_fkey;
alter table public.predictions rename column league_id to season_id;
alter table public.predictions add foreign key (season_id) references public.seasons (id) on delete cascade;
alter table public.predictions drop constraint predictions_league_id_user_id_key;
alter table public.predictions add constraint predictions_season_user_key unique (season_id, user_id);

alter table public.standings_updates drop constraint standings_updates_league_id_fkey;
alter table public.standings_updates rename column league_id to season_id;
alter table public.standings_updates add foreign key (season_id) references public.seasons (id) on delete cascade;

-- Ranks now depend on which league you're looking at, so they're worked out when read.
alter table public.prediction_scores drop column rank, drop column previous_rank;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.is_member(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where league_id = p_league_id and user_id = (select auth.uid())
  );
$$;

create function private.can_view_league(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.leagues l
    join public.seasons s on s.id = l.season_id
    where l.id = p_league_id
      and (
        private.is_admin()
        or l.created_by = (select auth.uid())
        or (
          s.status <> 'draft'
          and l.hidden_at is null
          and (l.type in ('official', 'public') or private.is_member(l.id))
        )
      )
  );
$$;

create function private.can_view_season(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.season_id = p_season_id and private.can_view_league(l.id)
  );
$$;

-- Competition seasons belong to the site, so only admins run them. A custom season belongs to
-- the person who created its one league.
create function private.is_season_manager(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.seasons s
    join public.leagues l on l.season_id = s.id
    where s.id = p_season_id
      and s.competition_id is null
      and l.created_by = (select auth.uid())
  );
$$;

create function private.can_edit_season(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_season_manager(p_season_id) and exists (
    select 1 from public.seasons s
    where s.id = p_season_id
      and (s.status = 'draft' or (s.status = 'published' and s.deadline > now()))
  );
$$;

-- A prediction is revealed after the deadline, to people who can see a league its owner plays in.
create function private.can_view_prediction(p_season_id uuid, p_owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.seasons s
    join public.leagues l on l.season_id = s.id
    join public.memberships m on m.league_id = l.id and m.user_id = p_owner
    where s.id = p_season_id
      and s.status <> 'draft'
      and s.deadline <= now()
      and private.can_view_league(l.id)
  );
$$;

create function private.is_complete_order(p_season_id uuid, p_team_order uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    cardinality(p_team_order) = (select count(*) from public.teams where season_id = p_season_id)
    and cardinality(p_team_order) = (select count(distinct team) from unnest(p_team_order) team)
    and not exists (
      select 1 from public.teams
      where season_id = p_season_id and id <> all (p_team_order)
    );
$$;

create function private.can_edit_logo_path(p_path text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folder text := split_part(p_path, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.can_edit_season(folder::uuid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.before_league_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  slug_base text;
begin
  if new.created_by is not null and not private.is_admin() and (
    select count(*) from public.leagues
    where created_by = new.created_by and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'league_limit_reached' using errcode = '53400';
  end if;

  slug_base := left(
    trim(both '-' from lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g'))),
    40
  );
  new.slug := concat_ws(
    '-',
    nullif(slug_base, ''),
    left(replace(gen_random_uuid()::text, '-', ''), 6)
  );
  new.join_code := private.new_join_code();
  return new;
end;
$$;

create trigger leagues_before_insert
  before insert on public.leagues
  for each row execute function private.before_league_insert();

create function private.after_league_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.memberships (league_id, user_id, role)
    values (new.id, new.created_by, 'player');
  end if;
  return new;
end;
$$;

create trigger leagues_after_insert
  after insert on public.leagues
  for each row execute function private.after_league_insert();

create function private.before_season_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Picks are revealed at the deadline, so it can't be reopened and the rules can't change after it.
  if old.status <> 'draft' and old.deadline <= now() and (
    new.deadline, new.team_count,
    new.promotion_count, new.playoff_from, new.playoff_to, new.relegation_count
  ) is distinct from (
    old.deadline, old.team_count,
    old.promotion_count, old.playoff_from, old.playoff_to, old.relegation_count
  ) then
    raise exception 'league_locked_after_deadline' using errcode = '42501';
  end if;

  if new.deadline is distinct from old.deadline and new.deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;

  if old.status <> 'draft' and new.team_count <> (
    select count(*) from public.teams where season_id = new.id
  ) then
    raise exception 'team_count_must_match_teams' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger seasons_before_update
  before update on public.seasons
  for each row execute function private.before_season_update();

-- Changing the set of teams invalidates existing predictions. Renames don't reach this trigger.
create function private.after_team_set_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  changed_season uuid := coalesce(new.season_id, old.season_id);
begin
  if exists (select 1 from public.seasons where id = changed_season and status <> 'draft') then
    update public.seasons
    set team_count = (select count(*) from public.teams where season_id = changed_season)
    where id = changed_season;

    update public.predictions set needs_review = true where season_id = changed_season;
  end if;
  return null;
end;
$$;

create trigger teams_after_set_change
  after insert or delete on public.teams
  for each row execute function private.after_team_set_change();

-- ---------------------------------------------------------------------------
-- Read model
-- ---------------------------------------------------------------------------

-- Row security on the underlying tables applies to whoever is reading.
create view public.league_details with (security_invoker = true) as
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
  coalesce(sp.name, s.sport_label) as sport
from public.leagues l
join public.seasons s on s.id = l.season_id
left join public.competitions c on c.id = s.competition_id
left join public.sports sp on sp.id = c.sport_id;

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

create function public.current_user_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin();
$$;

-- Starts a league with its own hidden season.
create function public.create_custom_league(
  p_name text,
  p_type public.league_type,
  p_sport text,
  p_team_count integer,
  p_deadline timestamptz
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_season uuid;
  new_league uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_type = 'official' then
    raise exception 'official_leagues_need_a_competition' using errcode = '42501';
  end if;
  if p_deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;

  insert into public.seasons (sport_label, team_count, deadline)
  values (nullif(trim(p_sport), ''), p_team_count, p_deadline)
  returning id into new_season;

  insert into public.leagues (name, type, season_id, created_by)
  values (trim(p_name), p_type, new_season, auth.uid())
  returning id into new_league;
  return new_league;
end;
$$;

-- Starts a league on an official season. Teams, zones, deadline and standings come from the season.
create function public.create_preset_league(p_season_id uuid, p_name text, p_type public.league_type)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_league uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_type = 'official' then
    raise exception 'official_leagues_need_a_competition' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.seasons s
    join public.leagues l on l.season_id = s.id and l.type = 'official'
    where s.id = p_season_id
      and s.status = 'published'
      and s.deadline > now()
      and l.hidden_at is null
  ) then
    raise exception 'preset_not_available' using errcode = 'P0002';
  end if;

  insert into public.leagues (name, type, season_id, created_by)
  values (trim(p_name), p_type, p_season_id, auth.uid())
  returning id into new_league;
  return new_league;
end;
$$;

-- Starts a new official season, creating its sport and competition the first time they're used.
create function public.create_official_season(
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
    promotion_count, playoff_from, playoff_to, relegation_count
  )
  values (
    competition_id_found, trim(p_label), coalesce(source.team_count, p_team_count), p_deadline,
    coalesce(source.promotion_count, 0), source.playoff_from, source.playoff_to,
    coalesce(source.relegation_count, 0)
  )
  returning id into new_season;

  if p_copy_from is not null then
    insert into public.teams (season_id, name, logo_path, colour_primary, colour_secondary)
    select new_season, name, logo_path, colour_primary, colour_secondary
    from public.teams where season_id = p_copy_from;
  end if;

  insert into public.leagues (name, type, season_id, created_by)
  values (left(trim(p_competition) || ' ' || trim(p_label), 60), 'official', new_season, null)
  returning id into new_league;
  return new_league;
end;
$$;

-- Name and privacy belong to the league. The deadline and sport belong to the season, so only
-- whoever manages the season can change those: people on a preset can't.
create function public.update_league_basics(
  p_league_id uuid,
  p_name text,
  p_type public.league_type,
  p_sport text,
  p_deadline timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  season public.seasons;
  is_owner boolean;
begin
  select * into league from public.leagues where id = p_league_id for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  is_owner := league.created_by = auth.uid() or private.is_admin();
  if not is_owner then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  select * into season from public.seasons where id = league.season_id;
  if season.status = 'finished' or (season.status = 'published' and season.deadline <= now()) then
    raise exception 'league_locked_after_deadline' using errcode = '42501';
  end if;

  if (league.type = 'official') <> (p_type = 'official') then
    raise exception 'official_leagues_need_a_competition' using errcode = '42501';
  end if;

  update public.leagues set name = trim(p_name), type = p_type where id = p_league_id;

  if private.is_season_manager(season.id) then
    update public.seasons
    set
      deadline = p_deadline,
      sport_label = case when competition_id is null then nullif(trim(p_sport), '') end
    where id = season.id;
  end if;
end;
$$;

create function public.save_season_format(
  p_season_id uuid,
  p_promotion integer,
  p_playoff_from integer,
  p_playoff_to integer,
  p_relegation integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_edit_season(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  update public.seasons
  set
    promotion_count = p_promotion,
    playoff_from = p_playoff_from,
    playoff_to = p_playoff_to,
    relegation_count = p_relegation
  where id = p_season_id;
end;
$$;

-- Replaces a season's team list in one transaction, so a failed save can't leave it half changed.
create function public.save_season_teams(p_season_id uuid, p_team_count integer, p_teams jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  season public.seasons;
  current_count integer;
  new_count integer;
  removed_ids uuid[];
begin
  select * into season from public.seasons where id = p_season_id for update;
  if not found or not private.can_edit_season(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_teams) is distinct from 'array' then
    raise exception 'invalid_teams' using errcode = '22023';
  end if;

  create temporary table incoming on commit drop as
  select
    row_number() over () as position,
    entry.id,
    trim(entry.name) as name,
    entry.logo_path,
    coalesce(entry.colour_primary, '#223029') as colour_primary,
    coalesce(entry.colour_secondary, '#f1f5ef') as colour_secondary
  from jsonb_to_recordset(p_teams) as entry (
    id uuid, name text, logo_path text, colour_primary text, colour_secondary text
  );

  if exists (select 1 from incoming group by lower(name) having count(*) > 1) then
    raise exception 'duplicate_team_name' using errcode = '22023';
  end if;
  if exists (
    select 1 from incoming i
    where i.id is not null
      and not exists (select 1 from public.teams t where t.id = i.id and t.season_id = p_season_id)
  ) then
    raise exception 'invalid_teams' using errcode = '22023';
  end if;
  -- New logos go in this season's folder. A team may keep one copied from the previous season.
  if exists (
    select 1 from incoming i
    where i.logo_path is not null
      and not starts_with(i.logo_path, p_season_id::text || '/')
      and not exists (
        select 1 from public.teams t where t.id = i.id and t.logo_path = i.logo_path
      )
  ) then
    raise exception 'invalid_teams' using errcode = '22023';
  end if;

  select count(*) into new_count from incoming;
  select count(*) into current_count from public.teams where season_id = p_season_id;
  if season.status <> 'draft' and new_count not between 4 and 40 then
    raise exception 'team_count_out_of_range' using errcode = '22023';
  end if;

  select coalesce(array_agg(t.id), '{}') into removed_ids
  from public.teams t
  where t.season_id = p_season_id and t.id not in (
    select i.id from incoming i where i.id is not null
  );

  -- Clears every current name first, so teams can swap names or reuse a removed team's name.
  update public.teams set name = id::text where season_id = p_season_id;

  update public.teams t
  set
    name = i.name,
    logo_path = i.logo_path,
    colour_primary = i.colour_primary,
    colour_secondary = i.colour_secondary
  from incoming i
  where t.id = i.id;

  -- A published season's count is synced row by row, so it has to stay within 4 to 40 at each step.
  if current_count + (select count(*) from incoming where id is null) <= 40 then
    insert into public.teams (season_id, name, logo_path, colour_primary, colour_secondary)
    select p_season_id, name, logo_path, colour_primary, colour_secondary
    from incoming where id is null order by position;
    delete from public.teams where id = any (removed_ids);
  else
    delete from public.teams where id = any (removed_ids);
    insert into public.teams (season_id, name, logo_path, colour_primary, colour_secondary)
    select p_season_id, name, logo_path, colour_primary, colour_secondary
    from incoming where id is null order by position;
  end if;

  if season.status = 'draft' then
    update public.seasons set team_count = p_team_count where id = p_season_id;
  end if;
end;
$$;

create function public.publish_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  season public.seasons;
begin
  select * into season from public.seasons where id = p_season_id for update;
  if not found or not private.can_edit_season(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if season.status <> 'draft' then
    raise exception 'league_already_published' using errcode = '22023';
  end if;
  if season.deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;
  if season.team_count <> (select count(*) from public.teams where season_id = p_season_id) then
    raise exception 'team_count_must_match_teams' using errcode = '22023';
  end if;

  update public.seasons set status = 'published' where id = p_season_id;
end;
$$;

-- Deleting a custom league takes its hidden season with it. A preset league leaves the season and
-- everyone's predictions alone. An official league can't go while other leagues rely on its season.
create function public.delete_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  season public.seasons;
  locked boolean;
begin
  select * into league from public.leagues where id = p_league_id for update;
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  select * into season from public.seasons where id = league.season_id;
  locked := season.status <> 'draft' and season.deadline <= now();

  if not private.is_admin() and (league.created_by is distinct from auth.uid() or locked) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  if league.type = 'official' then
    if exists (
      select 1 from public.leagues where season_id = season.id and id <> league.id
    ) then
      raise exception 'season_has_other_leagues' using errcode = '23503';
    end if;
    delete from public.seasons where id = season.id;
  elsif season.competition_id is null then
    delete from public.seasons where id = season.id;
  else
    delete from public.leagues where id = league.id;
  end if;
end;
$$;

-- Shown before login, so this returns only what the join screen needs.
create function public.get_league_preview(p_join_code text)
returns table (
  id uuid,
  slug text,
  name text,
  type public.league_type,
  sport text,
  team_count integer,
  deadline timestamptz,
  creator_name text
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id, l.slug, l.name, l.type,
    coalesce(sp.name, s.sport_label),
    s.team_count, s.deadline, p.display_name
  from public.leagues l
  join public.seasons s on s.id = l.season_id
  left join public.competitions c on c.id = s.competition_id
  left join public.sports sp on sp.id = c.sport_id
  left join public.profiles p on p.id = l.created_by
  where l.join_code = upper(trim(p_join_code))
    and s.status <> 'draft'
    and l.hidden_at is null;
$$;

create function public.join_league(p_league_id uuid, p_join_code text default null)
returns public.member_role
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  season public.seasons;
  existing_role public.member_role;
  new_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into league from public.leagues where id = p_league_id;
  if found then
    select * into season from public.seasons where id = league.season_id;
  end if;

  -- A wrong code gets the same answer as no league, so codes can't be used to probe for leagues.
  if not found
    or season.status = 'draft'
    or league.hidden_at is not null
    or (
      league.type = 'private'
      and league.join_code is distinct from upper(trim(p_join_code))
      and not private.is_member(league.id)
    ) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  select role into existing_role from public.memberships
  where league_id = league.id and user_id = auth.uid();
  if found then
    return existing_role;
  end if;

  -- A table locked in before the deadline counts in any league for that season, even one joined later.
  new_role := case
    when season.status = 'published' and season.deadline > now() then 'player'
    when exists (
      select 1 from public.predictions
      where season_id = season.id and user_id = auth.uid()
    ) then 'player'
    else 'spectator'
  end;
  insert into public.memberships (league_id, user_id, role)
  values (league.id, auth.uid(), new_role);
  return new_role;
end;
$$;

create function public.submit_prediction(p_season_id uuid, p_team_order uuid[])
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  season public.seasons;
  saved_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into season from public.seasons where id = p_season_id;
  if not found or not private.can_view_season(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if season.status <> 'published' then
    raise exception 'league_not_open' using errcode = '42501';
  end if;
  if season.deadline <= now() then
    raise exception 'deadline_passed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.memberships m
    join public.leagues l on l.id = m.league_id
    where l.season_id = p_season_id
      and l.hidden_at is null
      and m.user_id = auth.uid()
      and m.role = 'player'
  ) then
    raise exception 'not_a_player' using errcode = '42501';
  end if;
  if not private.is_complete_order(p_season_id, p_team_order) then
    raise exception 'invalid_team_order' using errcode = '22023';
  end if;

  insert into public.predictions (season_id, user_id, team_order)
  values (p_season_id, auth.uid(), p_team_order)
  on conflict (season_id, user_id) do update
    set team_order = excluded.team_order, needs_review = false, submitted_at = now()
  returning submitted_at into saved_at;
  return saved_at;
end;
$$;

create function public.rotate_join_code(p_league_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  code text := private.new_join_code();
begin
  update public.leagues set join_code = code
  where id = p_league_id
    and (created_by = auth.uid() or private.is_admin());
  if not found then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  return code;
end;
$$;

-- Records the table and recalculates every score for the season in one transaction. Every league
-- on the season reads the same scores, which is how presets stay up to date.
create function public.update_standings(p_season_id uuid, p_team_order uuid[])
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
  cross join lateral private.score_prediction(
    p.team_order, p_team_order, season.promotion_count,
    season.playoff_from, season.playoff_to, season.relegation_count
  ) s
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

-- Ranks are per league: the same score can be 1st among friends and 900th in the official league.
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
  previous_rank integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  season_found uuid;
  latest_update uuid;
  earlier_update uuid;
begin
  if not private.can_view_league(p_league_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;

  select season_id into season_found from public.leagues where id = p_league_id;
  select id into latest_update from public.standings_updates
  where season_id = season_found order by version desc limit 1;
  select id into earlier_update from public.standings_updates
  where season_id = season_found order by version desc limit 1 offset 1;

  return query
  with members as (
    select m.user_id as member_id, p.id as prediction_id
    from public.memberships m
    join public.predictions p on p.user_id = m.user_id and p.season_id = season_found
    where m.league_id = p_league_id
  ),
  latest as (
    select
      member.member_id, s.base_points, s.bonus_points, s.exact_count,
      rank() over (
        order by s.base_points + s.bonus_points desc, s.exact_count desc
      )::integer as position
    from members member
    join public.prediction_scores s
      on s.prediction_id = member.prediction_id and s.standings_update_id = latest_update
  ),
  earlier as (
    select
      member.member_id,
      rank() over (
        order by s.base_points + s.bonus_points desc, s.exact_count desc
      )::integer as position
    from members member
    join public.prediction_scores s
      on s.prediction_id = member.prediction_id and s.standings_update_id = earlier_update
  )
  select
    latest.member_id, profile.display_name, profile.avatar_url,
    latest.base_points, latest.bonus_points,
    latest.base_points + latest.bonus_points,
    latest.exact_count, latest.position, earlier.position
  from latest
  join public.profiles profile on profile.id = latest.member_id
  left join earlier on earlier.member_id = latest.member_id
  order by latest.position, profile.display_name;
end;
$$;

create function public.finish_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  season public.seasons;
begin
  select * into season from public.seasons where id = p_season_id for update;
  if not found or not private.is_season_manager(p_season_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if season.status <> 'published' or season.deadline > now() then
    raise exception 'league_not_live' using errcode = '42501';
  end if;
  if not exists (select 1 from public.standings_updates where season_id = p_season_id) then
    raise exception 'no_standings_yet' using errcode = '22023';
  end if;

  update public.seasons set status = 'finished', finished_at = now() where id = p_season_id;
end;
$$;

create function public.reopen_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.seasons set status = 'published', finished_at = null
  where id = p_season_id and status = 'finished';
end;
$$;

create function public.set_league_hidden(p_league_id uuid, p_hidden boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.leagues
  set hidden_at = case when p_hidden then now() end
  where id = p_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security. All writes go through the functions above.
-- ---------------------------------------------------------------------------

alter table public.sports enable row level security;
alter table public.competitions enable row level security;
alter table public.seasons enable row level security;

create policy "profiles are readable when signed in" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "sports are public" on public.sports for select to anon, authenticated using (true);
create policy "competitions are public" on public.competitions for select to anon, authenticated using (true);

create policy "seasons of visible leagues are readable" on public.seasons
  for select to anon, authenticated using (private.can_view_season(id));

create policy "visible leagues are readable" on public.leagues
  for select to anon, authenticated using (private.can_view_league(id));

create policy "teams of visible seasons are readable" on public.teams
  for select to anon, authenticated using (private.can_view_season(season_id));

create policy "members of visible leagues are readable" on public.memberships
  for select to authenticated using (private.can_view_league(league_id));

create policy "players read their own and revealed predictions" on public.predictions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.can_view_prediction(season_id, user_id));

create policy "standings of visible seasons are readable" on public.standings_updates
  for select to anon, authenticated using (private.can_view_season(season_id));

create policy "scores of visible seasons are readable" on public.prediction_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.standings_updates s
      where s.id = standings_update_id and private.can_view_season(s.season_id)
    )
  );

create policy "users report leagues they can see" on public.reports
  for insert to authenticated
  with check (
    reported_by = (select auth.uid())
    and private.can_view_league(league_id)
    and (
      team_id is null
      or exists (
        select 1 from public.teams t
        join public.leagues l on l.season_id = t.season_id
        where t.id = team_id and l.id = reports.league_id
      )
    )
  );
create policy "users read their own reports and admins read all" on public.reports
  for select to authenticated
  using (reported_by = (select auth.uid()) or private.is_admin());
create policy "admins review reports" on public.reports
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy "managers upload team logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-logos' and private.can_edit_logo_path(name));
create policy "managers see their team logo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'team-logos' and private.can_edit_logo_path(name));
create policy "managers remove team logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and private.can_edit_logo_path(name));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public, private to anon, authenticated;

grant execute on function
  private.is_admin(),
  private.is_member(uuid),
  private.can_view_league(uuid),
  private.can_view_season(uuid),
  private.can_view_prediction(uuid, uuid)
to anon, authenticated;
grant execute on function private.can_edit_logo_path(text) to authenticated;

grant select (id, display_name, avatar_url) on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select on public.sports, public.competitions to anon, authenticated;
grant select on public.seasons, public.leagues, public.teams, public.standings_updates to anon, authenticated;
grant select on public.league_details to anon, authenticated;
grant select on public.memberships, public.predictions, public.prediction_scores to authenticated;

grant select on public.reports to authenticated;
grant insert (league_id, team_id, reason) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

grant execute on function public.get_league_preview(text) to anon, authenticated;
grant execute on function public.league_leaderboard(uuid) to anon, authenticated;
grant execute on function
  public.current_user_is_admin(),
  public.create_custom_league(text, public.league_type, text, integer, timestamptz),
  public.create_preset_league(uuid, text, public.league_type),
  public.create_official_season(text, text, text, integer, timestamptz, uuid),
  public.update_league_basics(uuid, text, public.league_type, text, timestamptz),
  public.save_season_format(uuid, integer, integer, integer, integer),
  public.save_season_teams(uuid, integer, jsonb),
  public.publish_season(uuid),
  public.delete_league(uuid),
  public.join_league(uuid, text),
  public.submit_prediction(uuid, uuid[]),
  public.rotate_join_code(uuid),
  public.update_standings(uuid, uuid[]),
  public.finish_season(uuid),
  public.reopen_season(uuid),
  public.set_league_hidden(uuid, boolean)
to authenticated;

commit;
