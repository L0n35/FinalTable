-- League setup: logo storage, saving a team list in one step, and the admin check for the wizard.

create function public.current_user_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin();
$$;

-- Replaces a league's team list in one transaction, so a failed save can't leave it half changed.
create function public.save_league_teams(p_league_id uuid, p_team_count integer, p_teams jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  league public.leagues;
  current_count integer;
  new_count integer;
  removed_ids uuid[];
begin
  select * into league from public.leagues where id = p_league_id for update;
  if not found or not private.can_edit_league(p_league_id) then
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
      and not exists (select 1 from public.teams t where t.id = i.id and t.league_id = p_league_id)
  ) then
    raise exception 'invalid_teams' using errcode = '22023';
  end if;
  if exists (
    select 1 from incoming
    where logo_path is not null and not starts_with(logo_path, p_league_id::text || '/')
  ) then
    raise exception 'invalid_teams' using errcode = '22023';
  end if;

  select count(*) into new_count from incoming;
  select count(*) into current_count from public.teams where league_id = p_league_id;
  if league.status <> 'draft' and new_count not between 4 and 40 then
    raise exception 'team_count_out_of_range' using errcode = '22023';
  end if;

  select coalesce(array_agg(t.id), '{}') into removed_ids
  from public.teams t
  where t.league_id = p_league_id and t.id not in (
    select i.id from incoming i where i.id is not null
  );

  -- Clears every current name first, so teams can swap names or reuse a removed team's name.
  update public.teams set name = id::text where league_id = p_league_id;

  update public.teams t
  set
    name = i.name,
    logo_path = i.logo_path,
    colour_primary = i.colour_primary,
    colour_secondary = i.colour_secondary
  from incoming i
  where t.id = i.id;

  -- A published league's count is synced row by row, so it has to stay within 4 to 40 at each step.
  if current_count + (select count(*) from incoming where id is null) <= 40 then
    insert into public.teams (league_id, name, logo_path, colour_primary, colour_secondary)
    select p_league_id, name, logo_path, colour_primary, colour_secondary
    from incoming where id is null order by position;
    delete from public.teams where id = any (removed_ids);
  else
    delete from public.teams where id = any (removed_ids);
    insert into public.teams (league_id, name, logo_path, colour_primary, colour_secondary)
    select p_league_id, name, logo_path, colour_primary, colour_secondary
    from incoming where id is null order by position;
  end if;

  if league.status = 'draft' then
    update public.leagues set team_count = p_team_count where id = p_league_id;
  end if;
end;
$$;

revoke all on function public.current_user_is_admin() from public, anon, authenticated;
revoke all on function public.save_league_teams(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.save_league_teams(uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Team logos. Files are stored as <league id>/<random name> and are public to read,
-- because logos appear on public pages. Size and type limits are enforced by the bucket.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 204800, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

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
  return private.can_edit_league(folder::uuid);
end;
$$;

revoke all on function private.can_edit_logo_path(text) from public, anon, authenticated;
grant execute on function private.can_edit_logo_path(text) to authenticated;

create policy "creators upload team logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-logos' and private.can_edit_logo_path(name));
create policy "creators see their team logo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'team-logos' and private.can_edit_logo_path(name));
create policy "creators remove team logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and private.can_edit_logo_path(name));
