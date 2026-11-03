-- The launch's global leagues. Run this once in the SQL Editor, after the migrations.
--
-- The SQL Editor has no signed-in user, so this can't use the admin functions. It follows the same
-- steps they do: a draft season, then its teams and league, then publishing once the count matches.
-- It runs in one transaction and stops if a season already exists, so a failure changes nothing.
--
-- Badges use each club's colours and a short code rather than real logos.
-- Lock times are the first kick-off where the fixture is published. To move one later, use the
-- league's setup page. Zones can't change once a deadline has passed.

begin;

insert into public.sports (name) values
  ('Football'), ('Basketball'), ('Cricket'), ('Aussie rules'), ('Rugby league')
on conflict (lower(name)) do update set name = excluded.name;

insert into public.competitions (sport_id, name, accent, sort_order, opens_note)
select sport.id, item.name, item.accent, item.sort_order, item.opens_note
from (values
  ('Football', 'Premier League', '#7A2BF0', 10, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'La Liga', '#FF4B44', 20, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Serie A', '#0B8AFF', 30, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Bundesliga', '#D6001C', 40, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Ligue 1', '#0FB5AE', 50, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'EFL Championship', '#1F7A4D', 60, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Eredivisie', '#F26A21', 70, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Primeira Liga', '#00A36C', 80, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'Saudi Pro League', '#00C27A', 90, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'MLS East', '#1E90FF', 100, 'Opens for 2027-28 around mid-2027'),
  ('Football', 'MLS West', '#E5007D', 101, 'Opens for 2027-28 around mid-2027'),
  ('Basketball', 'NBA East', '#1D4ED8', 110, 'Opens for 2027-28 in late summer 2027'),
  ('Basketball', 'NBA West', '#DC2626', 111, 'Opens for 2027-28 in late summer 2027'),
  ('Basketball', 'EuroLeague', '#F97316', 120, 'Opens for 2027-28 in late summer 2027'),
  ('Rugby league', 'NRL', '#16A34A', 130, null),
  ('Cricket', 'IPL', '#4F46E5', 140, null),
  ('Aussie rules', 'AFL', '#DC143C', 150, null)
) as item (sport, name, accent, sort_order, opens_note)
join public.sports sport on lower(sport.name) = lower(item.sport)
on conflict (sport_id, lower(name)) do update
set
  name = excluded.name,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  opens_note = excluded.opens_note;

create or replace function pg_temp.add_season(
  p_sport text,
  p_competition text,
  p_label text,
  p_deadline timestamptz,
  p_promotion integer,
  p_playoff_to integer,
  p_relegation integer,
  p_promotion_label text,
  p_playoff_label text,
  p_teams jsonb
)
returns void
language plpgsql
as $$
declare
  competition_found uuid;
  new_season uuid;
  team_total integer := jsonb_array_length(p_teams);
begin
  select c.id into competition_found
  from public.competitions c
  join public.sports sport on sport.id = c.sport_id
  where c.name = p_competition and sport.name = p_sport;
  if competition_found is null then
    raise exception 'Missing competition: %', p_competition;
  end if;
  if exists (select 1 from public.seasons where competition_id = competition_found and label = p_label) then
    raise exception '% % already exists. Delete it on the Admin page first, then run this again.', p_competition, p_label;
  end if;

  insert into public.seasons (
    competition_id, label, team_count, deadline, promotion_count, playoff_from, playoff_to,
    relegation_count, promotion_label, playoff_label
  )
  values (
    competition_found, p_label, team_total, p_deadline, p_promotion,
    case when p_playoff_to is null then null else p_promotion + 1 end, p_playoff_to,
    p_relegation, p_promotion_label, p_playoff_label
  )
  returning id into new_season;

  insert into public.teams (season_id, name, short_name, colour_primary, colour_secondary)
  select new_season, team ->> 0, team ->> 1, team ->> 2, team ->> 3
  from jsonb_array_elements(p_teams) as team;

  insert into public.leagues (name, type, season_id, created_by)
  values (left(p_competition || ' ' || p_label, 60), 'official', new_season, null);

  if team_total <> (select count(*) from public.teams where season_id = new_season) then
    raise exception 'Team count for % % does not match.', p_competition, p_label;
  end if;

  update public.seasons set status = 'published' where id = new_season;
end;
$$;

-- Live straight away. Locked at the first game: Arsenal v Coventry City, Fri 21 Aug 2026, 8pm BST.
select pg_temp.add_season('Football', 'Premier League', '2026-27', '2026-08-21 19:00:00+00', 4, null, 3, 'Champions League', 'Playoffs', '[
  ["Arsenal", "ARS", "#EF0107", "#FFFFFF"],
  ["Aston Villa", "AVL", "#670E36", "#95BFE5"],
  ["Bournemouth", "BOU", "#DA291C", "#000000"],
  ["Brentford", "BRE", "#E30613", "#FFFFFF"],
  ["Brighton", "BHA", "#0057B8", "#FFFFFF"],
  ["Chelsea", "CHE", "#034694", "#FFFFFF"],
  ["Coventry City", "COV", "#59CBE8", "#10283D"],
  ["Crystal Palace", "CRY", "#1B458F", "#FFFFFF"],
  ["Everton", "EVE", "#003399", "#FFFFFF"],
  ["Fulham", "FUL", "#FFFFFF", "#000000"],
  ["Hull City", "HUL", "#F5A12D", "#000000"],
  ["Ipswich Town", "IPS", "#0044A9", "#FFFFFF"],
  ["Leeds United", "LEE", "#FFFFFF", "#1D428A"],
  ["Liverpool", "LIV", "#C8102E", "#FFFFFF"],
  ["Manchester City", "MCI", "#6CABDD", "#1C2C5B"],
  ["Manchester United", "MUN", "#DA291C", "#FBE122"],
  ["Newcastle United", "NEW", "#241F20", "#FFFFFF"],
  ["Nottingham Forest", "NFO", "#DD0000", "#FFFFFF"],
  ["Sunderland", "SUN", "#EB172B", "#FFFFFF"],
  ["Tottenham Hotspur", "TOT", "#FFFFFF", "#132257"]
]'::jsonb);

-- First game of the sprint season: Inter Miami v FC Cincinnati, Fri 19 Feb 2027, 8pm ET.
select pg_temp.add_season('Football', 'MLS East', '2027 Sprint', '2027-02-20 01:00:00+00', 0, 8, 0, 'Promoted', 'Playoffs', '[
  ["Atlanta United", "ATL", "#80000A", "#FFFFFF"],
  ["CF Montréal", "MTL", "#0033A1", "#FFFFFF"],
  ["Charlotte FC", "CLT", "#1A85C8", "#FFFFFF"],
  ["Chicago Fire", "CHI", "#102141", "#FFFFFF"],
  ["Columbus Crew", "CLB", "#FEDD00", "#000000"],
  ["D.C. United", "DC", "#000000", "#EF3E42"],
  ["FC Cincinnati", "CIN", "#003087", "#FE5000"],
  ["Inter Miami", "MIA", "#F7B5CD", "#231F20"],
  ["Nashville SC", "NSH", "#ECE83A", "#1F1646"],
  ["New England Revolution", "NE", "#0A2240", "#FFFFFF"],
  ["New York City FC", "NYC", "#6CACE4", "#041E42"],
  ["New York Red Bulls", "RBNY", "#ED1E36", "#FFFFFF"],
  ["Orlando City", "ORL", "#633492", "#FFFFFF"],
  ["Philadelphia Union", "PHI", "#071B2C", "#B38707"],
  ["Toronto FC", "TOR", "#B81137", "#FFFFFF"]
]'::jsonb);

select pg_temp.add_season('Football', 'MLS West', '2027 Sprint', '2027-02-20 01:00:00+00', 0, 8, 0, 'Promoted', 'Playoffs', '[
  ["Austin FC", "ATX", "#00B140", "#000000"],
  ["Colorado Rapids", "COL", "#960A2C", "#9CC2EA"],
  ["FC Dallas", "DAL", "#E81F3E", "#FFFFFF"],
  ["Houston Dynamo", "HOU", "#FF6B00", "#101820"],
  ["LA Galaxy", "LAG", "#00245D", "#FFD200"],
  ["LAFC", "LAFC", "#000000", "#C39E6D"],
  ["Minnesota United", "MIN", "#8CD2F4", "#231F20"],
  ["Portland Timbers", "POR", "#004812", "#EBE72B"],
  ["Real Salt Lake", "RSL", "#B30838", "#FFFFFF"],
  ["San Diego FC", "SD", "#0B2340", "#D6D9DC"],
  ["San Jose Earthquakes", "SJ", "#0067B1", "#FFFFFF"],
  ["Seattle Sounders", "SEA", "#5D9741", "#FFFFFF"],
  ["Sporting Kansas City", "SKC", "#91B0D5", "#002F65"],
  ["St. Louis City", "STL", "#DD004A", "#FFFFFF"],
  ["Vancouver Whitecaps", "VAN", "#00245E", "#FFFFFF"]
]'::jsonb);

-- The season opens in Las Vegas on Sat 27 Feb 2027 local time. Check the time when the full draw is out.
select pg_temp.add_season('Rugby league', 'NRL', '2027', '2027-02-27 18:00:00+00', 0, 8, 0, 'Promoted', 'Finals', '[
  ["Brisbane Broncos", "BRI", "#760135", "#FBBF15"],
  ["Canberra Raiders", "CAN", "#69BE28", "#000000"],
  ["Canterbury Bulldogs", "CBY", "#00539F", "#FFFFFF"],
  ["Cronulla Sharks", "CRO", "#00A0DD", "#000000"],
  ["Dolphins", "DOL", "#D4002A", "#FFD200"],
  ["Gold Coast Titans", "GLD", "#009FDF", "#FFFFFF"],
  ["Manly Sea Eagles", "MAN", "#6F163D", "#FFFFFF"],
  ["Melbourne Storm", "MEL", "#632390", "#FFFFFF"],
  ["Newcastle Knights", "NEW", "#003B7C", "#FFFFFF"],
  ["North Queensland Cowboys", "NQL", "#002B5C", "#FFDD02"],
  ["Parramatta Eels", "PAR", "#006EB5", "#FFC425"],
  ["Penrith Panthers", "PEN", "#111111", "#FFFFFF"],
  ["Perth Bears", "PER", "#C8102E", "#000000"],
  ["South Sydney Rabbitohs", "SOU", "#00582A", "#FFFFFF"],
  ["St George Illawarra Dragons", "SGI", "#FFFFFF", "#E2231A"],
  ["Sydney Roosters", "SYD", "#00205B", "#FFFFFF"],
  ["Warriors", "WAR", "#111111", "#97D700"],
  ["Wests Tigers", "WST", "#F57600", "#000000"]
]'::jsonb);

-- No official date yet, only reports of about 10 Mar 2027, so this locks a little early until confirmed.
select pg_temp.add_season('Cricket', 'IPL', '2027', '2027-03-09 12:00:00+00', 0, 4, 0, 'Promoted', 'Playoffs', '[
  ["Chennai Super Kings", "CSK", "#FFC107", "#0A2A66"],
  ["Delhi Capitals", "DC", "#004C93", "#FFFFFF"],
  ["Gujarat Titans", "GT", "#1B2133", "#C9A227"],
  ["Kolkata Knight Riders", "KKR", "#3A225D", "#F2C230"],
  ["Lucknow Super Giants", "LSG", "#0B5FA5", "#FFFFFF"],
  ["Mumbai Indians", "MI", "#004BA0", "#D1AB3E"],
  ["Punjab Kings", "PBKS", "#DD1F2D", "#FFFFFF"],
  ["Rajasthan Royals", "RR", "#EA1A85", "#FFFFFF"],
  ["Royal Challengers Bengaluru", "RCB", "#D71920", "#000000"],
  ["Sunrisers Hyderabad", "SRH", "#F26522", "#000000"]
]'::jsonb);

-- First game: Sydney v Geelong at the SCG on Wed 17 Mar 2027. Locks ahead of the evening start.
select pg_temp.add_season('Aussie rules', 'AFL', '2027', '2027-03-17 07:00:00+00', 0, 10, 0, 'Promoted', 'Finals', '[
  ["Adelaide Crows", "ADE", "#002B5C", "#FFD200"],
  ["Brisbane Lions", "BRL", "#A30046", "#FFC72C"],
  ["Carlton", "CAR", "#0E1E2D", "#FFFFFF"],
  ["Collingwood", "COL", "#000000", "#FFFFFF"],
  ["Essendon", "ESS", "#CC2031", "#000000"],
  ["Fremantle", "FRE", "#2A0D54", "#FFFFFF"],
  ["Geelong Cats", "GEE", "#002B5C", "#FFFFFF"],
  ["Gold Coast Suns", "GCS", "#D63239", "#FFD200"],
  ["GWS Giants", "GWS", "#F15C22", "#FFFFFF"],
  ["Hawthorn", "HAW", "#4D2004", "#FBBF15"],
  ["Melbourne", "MEL", "#0F1131", "#FFFFFF"],
  ["North Melbourne", "NTH", "#013B9F", "#FFFFFF"],
  ["Port Adelaide", "PTA", "#008AAB", "#000000"],
  ["Richmond", "RIC", "#000000", "#FED102"],
  ["St Kilda", "STK", "#ED0F05", "#FFFFFF"],
  ["Sydney Swans", "SYD", "#ED171F", "#FFFFFF"],
  ["West Coast Eagles", "WCE", "#003087", "#F2A900"],
  ["Western Bulldogs", "WBD", "#014896", "#FFFFFF"]
]'::jsonb);

commit;

select name, season_label, team_count, deadline, status
from public.league_details
where type = 'official' and competition_id is not null
order by deadline;
