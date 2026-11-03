-- Dismissing one report at a time, and letting people delete their own account.

begin;

create function public.dismiss_report(p_report_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.reports set status = 'dismissed' where id = p_report_id and status = 'open';
end;
$$;

-- Removes the signed-in user and everything that is theirs. Leagues nobody else is in go with them.
-- A league other people are in carries on, with its longest-standing member taking over.
create function public.delete_own_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- A custom season belongs to its one league, so it goes too. Preset leagues leave the official
  -- season alone.
  delete from public.seasons s
  where s.competition_id is null
    and exists (select 1 from public.leagues l where l.season_id = s.id and l.created_by = me)
    and not exists (
      select 1 from public.leagues l
      join public.memberships m on m.league_id = l.id
      where l.season_id = s.id and m.user_id <> me
    );
  delete from public.leagues l
  where l.created_by = me
    and not exists (select 1 from public.memberships m where m.league_id = l.id and m.user_id <> me);

  update public.leagues l
  set created_by = (
    select m.user_id from public.memberships m
    where m.league_id = l.id and m.user_id <> me
    order by m.joined_at, m.user_id
    limit 1
  )
  where l.created_by = me;

  -- Profiles, memberships and predictions follow through their foreign keys.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.dismiss_report(uuid) from public, anon, authenticated;
revoke all on function public.delete_own_account() from public, anon, authenticated;
grant execute on function public.dismiss_report(uuid) to authenticated;
grant execute on function public.delete_own_account() to authenticated;

commit;
