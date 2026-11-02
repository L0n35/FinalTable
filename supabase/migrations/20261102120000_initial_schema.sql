-- Final Table initial schema.
-- The database is the source of truth for every rule: browser checks are only a convenience.

create schema if not exists private;

create type public.league_type as enum ('host', 'public', 'private');
create type public.league_status as enum ('draft', 'published', 'finished');
create type public.member_role as enum ('player', 'spectator');
create type public.report_status as enum ('open', 'dismissed', 'actioned');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  join_code text not null unique,
  type public.league_type not null,
  name text not null check (char_length(name) between 1 and 60),
  sport text check (char_length(sport) <= 40),
  team_count integer not null check (team_count between 4 and 40),
  deadline timestamptz not null,
  promotion_count integer not null default 0 check (promotion_count >= 0),
  playoff_from integer,
  playoff_to integer,
  relegation_count integer not null default 0 check (relegation_count >= 0),
  status public.league_status not null default 'draft',
  hidden_at timestamptz,
  finished_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint playoff_range_complete check ((playoff_from is null) = (playoff_to is null)),
  constraint playoff_range_ordered check (playoff_from <= playoff_to),
  constraint zones_fit check (promotion_count + relegation_count <= team_count),
  constraint playoff_between_zones check (
    playoff_from is null
    or (playoff_from > promotion_count and playoff_to <= team_count - relegation_count)
  )
);

create index leagues_directory_idx on public.leagues (type, deadline)
  where status <> 'draft' and hidden_at is null;
create index leagues_created_by_idx on public.leagues (created_by, created_at);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  logo_path text,
  colour_primary text not null default '#223029' check (colour_primary ~ '^#[0-9a-fA-F]{6}$'),
  colour_secondary text not null default '#f1f5ef' check (colour_secondary ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create unique index teams_league_name_idx on public.teams (league_id, lower(name));

create table public.memberships (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_order uuid[] not null,
  needs_review boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index predictions_user_idx on public.predictions (user_id);

create table public.standings_updates (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  version integer not null,
  team_order uuid[] not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, version)
);

create table public.prediction_scores (
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  standings_update_id uuid not null references public.standings_updates (id) on delete cascade,
  base_points integer not null,
  bonus_points integer not null,
  exact_count integer not null,
  rank integer not null,
  previous_rank integer,
  primary key (prediction_id, standings_update_id)
);

create index prediction_scores_update_idx on public.prediction_scores (standings_update_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  reported_by uuid default auth.uid() references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at) where status = 'open';

-- ---------------------------------------------------------------------------
-- Helpers. These live outside the API schema, so they can't be called as RPCs.
-- ---------------------------------------------------------------------------

create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

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
    select 1 from public.leagues l
    where l.id = p_league_id
      and (
        private.is_admin()
        or l.created_by = (select auth.uid())
        or (
          l.status <> 'draft'
          and l.hidden_at is null
          and (l.type in ('host', 'public') or private.is_member(l.id))
        )
      )
  );
$$;

create function private.can_edit_league(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_league_id
      and (l.created_by = (select auth.uid()) or private.is_admin())
      and (l.status = 'draft' or (l.status = 'published' and l.deadline > now()))
  );
$$;

-- Picks stay hidden until the deadline, measured by the database clock.
create function private.picks_revealed(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.status <> 'draft' and l.deadline <= now()
  ) and private.can_view_league(p_league_id);
$$;

create function private.is_complete_order(p_league_id uuid, p_team_order uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    cardinality(p_team_order) = (select count(*) from public.teams where league_id = p_league_id)
    and cardinality(p_team_order) = (select count(distinct team) from unnest(p_team_order) team)
    and not exists (
      select 1 from public.teams
      where league_id = p_league_id and id <> all (p_team_order)
    );
$$;

create function private.new_join_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  -- 32 characters, leaving out 0, O, 1 and I, which are easy to misread.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := uuid_send(gen_random_uuid());
  byte_index integer;
  code text := '';
begin
  -- These eight bytes of a v4 UUID are fully random. 256 is a multiple of 32, so there is no bias.
  foreach byte_index in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    code := code || substr(alphabet, get_byte(random_bytes, byte_index) % 32 + 1, 1);
  end loop;
  return code;
end;
$$;

-- Scoring lives in this one function, so the points system can change without touching the app.
create function private.score_prediction(
  p_predicted uuid[],
  p_actual uuid[],
  p_promotion integer,
  p_playoff_from integer,
  p_playoff_to integer,
  p_relegation integer,
  out base_points integer,
  out bonus_points integer,
  out exact_count integer
)
language plpgsql immutable set search_path = ''
as $$
declare
  team_total constant integer := cardinality(p_actual);
  relegation_start constant integer := team_total - p_relegation;
  predicted_position integer;
  actual_position integer;
begin
  base_points := 0;
  bonus_points := 0;
  exact_count := 0;

  for predicted_position in 1 .. cardinality(p_predicted) loop
    actual_position := array_position(p_actual, p_predicted[predicted_position]);
    base_points := base_points + team_total - abs(predicted_position - actual_position);

    if predicted_position = actual_position then
      exact_count := exact_count + 1;
    end if;
    if predicted_position <= p_promotion and actual_position <= p_promotion then
      bonus_points := bonus_points + 5;
    end if;
    if predicted_position > relegation_start and actual_position > relegation_start then
      bonus_points := bonus_points + 5;
    end if;
    if predicted_position between p_playoff_from and p_playoff_to
      and actual_position between p_playoff_from and p_playoff_to then
      bonus_points := bonus_points + 3;
    end if;
  end loop;

  if p_predicted[1] = p_actual[1] then
    bonus_points := bonus_points + 10;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        'Player'
      ),
      40
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.before_league_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  slug_base text;
begin
  if new.type = 'host' and not private.is_admin() then
    raise exception 'only_admins_can_create_host_leagues' using errcode = '42501';
  end if;

  if new.deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;

  if not private.is_admin() and (
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

create function private.before_league_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Picks are revealed at the deadline, so it can't be reopened and the rules can't change after it.
  if old.status <> 'draft' and old.deadline <= now() and (
    new.deadline, new.type, new.team_count,
    new.promotion_count, new.playoff_from, new.playoff_to, new.relegation_count
  ) is distinct from (
    old.deadline, old.type, old.team_count,
    old.promotion_count, old.playoff_from, old.playoff_to, old.relegation_count
  ) then
    raise exception 'league_locked_after_deadline' using errcode = '42501';
  end if;

  if new.deadline is distinct from old.deadline and new.deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;

  if new.type is distinct from old.type
    and 'host' in (new.type, old.type)
    and not private.is_admin() then
    raise exception 'only_admins_can_manage_host_leagues' using errcode = '42501';
  end if;

  if old.status <> 'draft' and new.team_count <> (
    select count(*) from public.teams where league_id = new.id
  ) then
    raise exception 'team_count_must_match_teams' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger leagues_before_update
  before update on public.leagues
  for each row execute function private.before_league_update();

-- Changing the set of teams invalidates existing predictions. Renames don't reach this trigger.
create function private.after_team_set_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  changed_league uuid := coalesce(new.league_id, old.league_id);
begin
  if exists (select 1 from public.leagues where id = changed_league and status <> 'draft') then
    update public.leagues
    set team_count = (select count(*) from public.teams where league_id = changed_league)
    where id = changed_league;

    update public.predictions set needs_review = true where league_id = changed_league;
  end if;
  return null;
end;
$$;

create trigger teams_after_set_change
  after insert or delete on public.teams
  for each row execute function private.after_team_set_change();

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

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
  select l.id, l.slug, l.name, l.type, l.sport, l.team_count, l.deadline, p.display_name
  from public.leagues l
  left join public.profiles p on p.id = l.created_by
  where l.join_code = upper(trim(p_join_code))
    and l.status <> 'draft'
    and l.hidden_at is null;
$$;

create function public.join_league(p_league_id uuid, p_join_code text default null)
returns public.member_role
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  existing_role public.member_role;
  new_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into league from public.leagues where id = p_league_id;

  -- A wrong code gets the same answer as no league, so codes can't be used to probe for leagues.
  if not found
    or league.status = 'draft'
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

  new_role := case
    when league.status = 'published' and league.deadline > now() then 'player'
    else 'spectator'
  end;
  insert into public.memberships (league_id, user_id, role)
  values (league.id, auth.uid(), new_role);
  return new_role;
end;
$$;

create function public.submit_prediction(p_league_id uuid, p_team_order uuid[])
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  saved_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into league from public.leagues where id = p_league_id;
  if not found or not private.can_view_league(p_league_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'published' or league.hidden_at is not null then
    raise exception 'league_not_open' using errcode = '42501';
  end if;
  if league.deadline <= now() then
    raise exception 'deadline_passed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships
    where league_id = p_league_id and user_id = auth.uid() and role = 'player'
  ) then
    raise exception 'not_a_player' using errcode = '42501';
  end if;
  if not private.is_complete_order(p_league_id, p_team_order) then
    raise exception 'invalid_team_order' using errcode = '22023';
  end if;

  insert into public.predictions (league_id, user_id, team_order)
  values (p_league_id, auth.uid(), p_team_order)
  on conflict (league_id, user_id) do update
    set team_order = excluded.team_order, needs_review = false, submitted_at = now()
  returning submitted_at into saved_at;
  return saved_at;
end;
$$;

create function public.publish_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
begin
  select * into league from public.leagues where id = p_league_id for update;
  if not found or not private.can_edit_league(p_league_id) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'draft' then
    raise exception 'league_already_published' using errcode = '22023';
  end if;
  if league.deadline <= now() then
    raise exception 'deadline_must_be_in_the_future' using errcode = '22023';
  end if;
  if league.team_count <> (select count(*) from public.teams where league_id = p_league_id) then
    raise exception 'team_count_must_match_teams' using errcode = '22023';
  end if;

  update public.leagues set status = 'published' where id = p_league_id;
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

-- Records the table and recalculates every score in one transaction.
create function public.update_standings(p_league_id uuid, p_team_order uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  previous_update public.standings_updates;
  new_update_id uuid;
begin
  -- The row lock makes concurrent updates take turns, so versions stay in order.
  select * into league from public.leagues where id = p_league_id for update;
  if not found or not (league.created_by = auth.uid() or private.is_admin()) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'published' or league.hidden_at is not null then
    raise exception 'league_not_live' using errcode = '42501';
  end if;
  if league.deadline > now() then
    raise exception 'deadline_not_reached' using errcode = '42501';
  end if;
  if not private.is_complete_order(p_league_id, p_team_order) then
    raise exception 'invalid_team_order' using errcode = '22023';
  end if;

  select * into previous_update from public.standings_updates
  where league_id = p_league_id
  order by version desc
  limit 1;

  insert into public.standings_updates (league_id, version, team_order, updated_by)
  values (p_league_id, coalesce(previous_update.version, 0) + 1, p_team_order, auth.uid())
  returning id into new_update_id;

  insert into public.prediction_scores (
    prediction_id, standings_update_id, base_points, bonus_points, exact_count, rank, previous_rank
  )
  select
    scored.id,
    new_update_id,
    scored.base_points,
    scored.bonus_points,
    scored.exact_count,
    rank() over (
      order by scored.base_points + scored.bonus_points desc, scored.exact_count desc
    ),
    previous_score.rank
  from (
    select p.id, s.base_points, s.bonus_points, s.exact_count
    from public.predictions p
    cross join lateral private.score_prediction(
      p.team_order, p_team_order, league.promotion_count,
      league.playoff_from, league.playoff_to, league.relegation_count
    ) s
    where p.league_id = p_league_id and not p.needs_review
  ) scored
  left join public.prediction_scores previous_score
    on previous_score.prediction_id = scored.id
    and previous_score.standings_update_id = previous_update.id;

  -- Only the latest two sets of scores are needed, for rank movement. This keeps the database small.
  delete from public.prediction_scores
  where standings_update_id in (
    select id from public.standings_updates
    where league_id = p_league_id
      and id <> new_update_id
      and id is distinct from previous_update.id
  );

  return new_update_id;
end;
$$;

create function public.finish_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
begin
  select * into league from public.leagues where id = p_league_id for update;
  if not found or not (league.created_by = auth.uid() or private.is_admin()) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  if league.status <> 'published' or league.deadline > now() then
    raise exception 'league_not_live' using errcode = '42501';
  end if;
  if not exists (select 1 from public.standings_updates where league_id = p_league_id) then
    raise exception 'no_standings_yet' using errcode = '22023';
  end if;

  update public.leagues set status = 'finished', finished_at = now() where id = p_league_id;
end;
$$;

create function public.reopen_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.leagues set status = 'published', finished_at = null
  where id = p_league_id and status = 'finished';
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
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.predictions enable row level security;
alter table public.standings_updates enable row level security;
alter table public.prediction_scores enable row level security;
alter table public.reports enable row level security;

create policy "profiles are readable when signed in" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- The creator check is inline because helper functions can't see a row during its own insert,
-- which would stop a creator reading back the league they just made.
create policy "visible leagues are readable" on public.leagues
  for select to anon, authenticated
  using (created_by = (select auth.uid()) or private.can_view_league(id));
create policy "users create their own leagues" on public.leagues
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "creators edit open leagues" on public.leagues
  for update to authenticated
  using (private.can_edit_league(id)) with check (true);
create policy "creators delete open leagues and admins delete any" on public.leagues
  for delete to authenticated using (private.can_edit_league(id) or private.is_admin());

create policy "teams of visible leagues are readable" on public.teams
  for select to anon, authenticated using (private.can_view_league(league_id));
create policy "creators add teams to open leagues" on public.teams
  for insert to authenticated with check (private.can_edit_league(league_id));
create policy "creators edit teams in open leagues" on public.teams
  for update to authenticated
  using (private.can_edit_league(league_id)) with check (private.can_edit_league(league_id));
create policy "creators remove teams from open leagues" on public.teams
  for delete to authenticated using (private.can_edit_league(league_id));

create policy "members of visible leagues are readable" on public.memberships
  for select to authenticated using (private.can_view_league(league_id));

create policy "players read their own and revealed predictions" on public.predictions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.picks_revealed(league_id));

create policy "standings of visible leagues are readable" on public.standings_updates
  for select to anon, authenticated using (private.can_view_league(league_id));

create policy "scores of visible leagues are readable" on public.prediction_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.standings_updates s
      where s.id = standings_update_id and private.can_view_league(s.league_id)
    )
  );

create policy "users report leagues they can see" on public.reports
  for insert to authenticated
  with check (
    reported_by = (select auth.uid())
    and private.can_view_league(league_id)
    and (
      team_id is null
      or exists (select 1 from public.teams t where t.id = team_id and t.league_id = reports.league_id)
    )
  );
create policy "users read their own reports and admins read all" on public.reports
  for select to authenticated
  using (reported_by = (select auth.uid()) or private.is_admin());
create policy "admins review reports" on public.reports
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants everything to the API roles by default, so start
-- from nothing and open up only what each role needs, column by column.
-- ---------------------------------------------------------------------------

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public, private to anon, authenticated;

grant execute on function
  private.is_admin(),
  private.is_member(uuid),
  private.can_view_league(uuid),
  private.can_edit_league(uuid),
  private.picks_revealed(uuid)
to anon, authenticated;

grant select (id, display_name, avatar_url) on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select on public.leagues to anon, authenticated;
grant insert (
  type, name, sport, team_count, deadline,
  promotion_count, playoff_from, playoff_to, relegation_count
) on public.leagues to authenticated;
grant update (
  type, name, sport, team_count, deadline,
  promotion_count, playoff_from, playoff_to, relegation_count
) on public.leagues to authenticated;
grant delete on public.leagues to authenticated;

grant select on public.teams to anon, authenticated;
grant insert (league_id, name, logo_path, colour_primary, colour_secondary) on public.teams to authenticated;
grant update (name, logo_path, colour_primary, colour_secondary) on public.teams to authenticated;
grant delete on public.teams to authenticated;

grant select on public.memberships to authenticated;
grant select on public.predictions to authenticated;
grant select on public.standings_updates to anon, authenticated;
grant select on public.prediction_scores to authenticated;

grant select on public.reports to authenticated;
grant insert (league_id, team_id, reason) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

grant execute on function public.get_league_preview(text) to anon, authenticated;
grant execute on function
  public.join_league(uuid, text),
  public.submit_prediction(uuid, uuid[]),
  public.publish_league(uuid),
  public.rotate_join_code(uuid),
  public.update_standings(uuid, uuid[]),
  public.finish_league(uuid),
  public.reopen_league(uuid),
  public.set_league_hidden(uuid, boolean)
to authenticated;
