-- Limits on reports, and the functions admins use to review them.

begin;

-- One open report per person for each league or team, so the queue can't be flooded by one person.
create unique index one_open_report on public.reports (
  reported_by, league_id, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'open';

create function private.before_report_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (
    select count(*) from public.reports
    where reported_by = new.reported_by and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'report_limit_reached' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.before_report_insert();

-- Closes every open report on a league, as dismissed or as acted on by hiding the league.
create function public.resolve_league_reports(p_league_id uuid, p_hide boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_hide then
    update public.leagues set hidden_at = now() where id = p_league_id;
  end if;
  update public.reports
  set status = case when p_hide then 'actioned' else 'dismissed' end::public.report_status
  where league_id = p_league_id and status = 'open';
end;
$$;

-- Takes a logo off a team, which falls back to its badge, and returns the file path so the app can
-- delete the file. Works after the deadline, unlike the setup functions.
create function public.remove_team_logo(p_team_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  old_path text;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select logo_path into old_path from public.teams where id = p_team_id for update;
  update public.teams set logo_path = null where id = p_team_id;
  update public.reports set status = 'actioned' where team_id = p_team_id and status = 'open';
  return old_path;
end;
$$;

-- The file must go too, because logos are served from a public address. Deleting a file also needs
-- permission to read its row.
create policy "admins see any team logo file" on storage.objects
  for select to authenticated
  using (bucket_id = 'team-logos' and private.is_admin());
create policy "admins remove any team logo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and private.is_admin());

revoke all on function private.before_report_insert() from public, anon, authenticated;
revoke all on function public.resolve_league_reports(uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_team_logo(uuid) from public, anon, authenticated;
grant execute on function public.resolve_league_reports(uuid, boolean) to authenticated;
grant execute on function public.remove_team_logo(uuid) to authenticated;

commit;
