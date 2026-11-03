import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

const FUTURE = "2099-01-01T00:00:00Z";

let db: Db;
let admin: string;
let creator: string;
let alice: string;
let bob: string;
let outsider: string;

type LeagueInfo = { id: string; season_id: string; slug: string; join_code: string };

type TeamInput = {
  id?: string;
  name: string;
  logo_path?: string | null;
  colour_primary?: string;
};
const named = (...names: string[]): TeamInput[] => names.map((name) => ({ name }));
const teamNames = (count: number) =>
  Array.from({ length: count }, (_, i) => `Team ${String(i + 1).padStart(2, "0")}`);

const infoOf = async (leagueId: string): Promise<LeagueInfo> =>
  (
    await db.pg.query<LeagueInfo>(
      "select id, season_id, slug, join_code from public.leagues where id = $1",
      [leagueId],
    )
  ).rows[0];

const saveTeams = (user: string, seasonId: string, teams: TeamInput[], count = teams.length) =>
  db.asUser(user, "select public.save_season_teams($1, $2, $3::jsonb)", [
    seasonId,
    count,
    JSON.stringify(teams),
  ]);

const teamsOf = async (seasonId: string) =>
  (
    await db.pg.query<{ id: string; name: string; logo_path: string | null; colour_primary: string }>(
      "select id, name, logo_path, colour_primary from public.teams where season_id = $1 order by name",
      [seasonId],
    )
  ).rows;

const publish = (user: string, seasonId: string) =>
  db.asUser(user, "select public.publish_season($1)", [seasonId]);

async function draftCustom(
  type: "public" | "private" = "public",
  { teams = 4, by = creator }: { teams?: number; by?: string } = {},
) {
  const [{ id }] = await db.asUser<{ id: string }>(
    by,
    "select public.create_custom_league('Test League', $1, 'Football', $2, $3) as id",
    [type, teams, FUTURE],
  );
  return infoOf(id);
}

async function customLeague(type: "public" | "private" = "public", teamCount = 4, by = creator) {
  const league = await draftCustom(type, { teams: teamCount, by });
  await saveTeams(by, league.season_id, named(...teamNames(teamCount)));
  await publish(by, league.season_id);
  const teams = (await teamsOf(league.season_id)).map((team) => team.id);
  return { ...league, teams };
}

async function officialSeason(label = "2026-27", competition = "Premier League", teamCount = 4) {
  const [{ id }] = await db.asUser<{ id: string }>(
    admin,
    "select public.create_official_season('Football', $1, $2, $3, $4) as id",
    [competition, label, teamCount, FUTURE],
  );
  const league = await infoOf(id);
  await saveTeams(admin, league.season_id, named(...teamNames(teamCount)));
  await publish(admin, league.season_id);
  const teams = (await teamsOf(league.season_id)).map((team) => team.id);
  return { ...league, teams };
}

async function presetLeague(seasonId: string, type: "public" | "private" = "private", by = creator) {
  const [{ id }] = await db.asUser<{ id: string }>(
    by,
    "select public.create_preset_league($1, 'Friends', $2) as id",
    [seasonId, type],
  );
  return infoOf(id);
}

const submit = (user: string, seasonId: string, order: string[]) =>
  db.asUser(user, "select public.submit_prediction($1, $2)", [seasonId, order]);
const join = (user: string, leagueId: string, code?: string) =>
  db.asUser<{ join_league: string }>(user, "select public.join_league($1, $2)", [
    leagueId,
    code ?? null,
  ]);
const updateStandings = (user: string, seasonId: string, order: string[]) =>
  db.asUser(user, "select public.update_standings($1, $2)", [seasonId, order]);

type BoardRow = {
  user_id: string;
  base_points: number;
  bonus_points: number;
  total_points: number;
  exact_count: number;
  rank: number;
  previous_rank: number | null;
};
const leaderboard = (user: string, leagueId: string) =>
  db.asUser<BoardRow>(user, "select * from public.league_leaderboard($1)", [leagueId]);

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("Admin", { admin: true });
  creator = await db.createUser("Creator");
  alice = await db.createUser("Alice");
  bob = await db.createUser("Bob");
  outsider = await db.createUser("Outsider");
});

// The daily league limit would otherwise trip across tests.
beforeEach(async () => {
  await db.pg.exec(`
    delete from public.reports;
    delete from public.seasons;
    delete from public.competitions;
    delete from public.sports;
    delete from storage.objects;
  `);
});

describe("profiles", () => {
  it("creates a profile from the Google account on sign-up", async () => {
    const rows = await db.asUser<{ display_name: string; avatar_url: string }>(
      alice,
      "select display_name, avatar_url from public.profiles where id = $1",
      [alice],
    );
    expect(rows).toEqual([{ display_name: "Alice", avatar_url: "https://example.test/Alice.png" }]);
  });

  it("falls back to a default name when Google provides none", async () => {
    const { rows } = await db.pg.query<{ id: string }>(
      "insert into auth.users default values returning id",
    );
    const profile = await db.pg.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [rows[0].id],
    );
    expect(profile.rows[0].display_name).toBe("Player");
  });

  it("lets users rename themselves but not edit other people", async () => {
    await db.asUser(bob, "update public.profiles set display_name = 'Bobby' where id = $1", [bob]);
    await db.asUser(bob, "update public.profiles set display_name = 'Hacked' where id = $1", [alice]);
    const { rows } = await db.pg.query<{ id: string; display_name: string }>(
      "select id, display_name from public.profiles where id = any($1)",
      [[alice, bob]],
    );
    expect(rows.find((row) => row.id === bob)?.display_name).toBe("Bobby");
    expect(rows.find((row) => row.id === alice)?.display_name).toBe("Alice");
    await db.pg.query("update public.profiles set display_name = 'Bob' where id = $1", [bob]);
  });

  it("does not let users make themselves admin or see who is one", async () => {
    await expect(
      db.asUser(alice, "update public.profiles set is_admin = true where id = $1", [alice]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, "select is_admin from public.profiles")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("does not expose profiles to signed-out visitors", async () => {
    await expect(db.asUser(null, "select display_name from public.profiles")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("reports the signed-in user's own admin status only", async () => {
    const sql = "select public.current_user_is_admin() as admin";
    expect(await db.asUser(admin, sql)).toEqual([{ admin: true }]);
    expect(await db.asUser(alice, sql)).toEqual([{ admin: false }]);
    await expect(db.asUser(null, sql)).rejects.toThrow(/permission denied/);
  });
});

describe("custom leagues", () => {
  it("generates a slug and an unambiguous eight-character join code", async () => {
    const league = await draftCustom();
    expect(league.join_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(league.slug).toMatch(/^test-league-[0-9a-f]{6}$/);
  });

  it("adds the creator as a player", async () => {
    const league = await draftCustom();
    const rows = await db.asUser<{ role: string }>(
      creator,
      "select role from public.memberships where league_id = $1 and user_id = $2",
      [league.id, creator],
    );
    expect(rows).toEqual([{ role: "player" }]);
  });

  it("gets a hidden season with no competition", async () => {
    const league = await draftCustom();
    const { rows } = await db.pg.query<{ competition_id: string | null; sport_label: string }>(
      "select competition_id, sport_label from public.seasons where id = $1",
      [league.season_id],
    );
    expect(rows[0]).toEqual({ competition_id: null, sport_label: "Football" });
  });

  it("can't be created as official", async () => {
    await expect(
      db.asUser(creator, "select public.create_custom_league('X', 'official', null, 4, $1)", [FUTURE]),
    ).rejects.toThrow(/official_leagues_need_a_competition/);
    const league = await draftCustom();
    await expect(
      db.asUser(creator, "select public.update_league_basics($1, 'X', 'official', null, $2)", [
        league.id,
        FUTURE,
      ]),
    ).rejects.toThrow(/official_leagues_need_a_competition/);
  });

  it("limits users to five leagues a day, across custom and preset, but not admins", async () => {
    for (let i = 0; i < 4; i++) await draftCustom();
    const official = await officialSeason();
    await presetLeague(official.season_id);
    await expect(draftCustom()).rejects.toThrow(/league_limit_reached/);
    await expect(presetLeague(official.season_id)).rejects.toThrow(/league_limit_reached/);
    for (let i = 0; i < 6; i++) await draftCustom("public", { by: admin });
  });

  it("rejects deadlines in the past", async () => {
    await expect(
      db.asUser(creator, "select public.create_custom_league('X', 'public', null, 4, now() - interval '1 minute')"),
    ).rejects.toThrow(/deadline_must_be_in_the_future/);
  });

  it.each([
    ["too few teams", 3, 0, null, null, 0],
    ["too many teams", 41, 0, null, null, 0],
  ])("rejects %s", async (_name, count) => {
    await expect(
      db.asUser(creator, "select public.create_custom_league('X', 'public', null, $1, $2)", [count, FUTURE]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it.each([
    ["zones that overlap", 4, 3, null, null, 2],
    ["playoffs inside promotion", 10, 3, 3, 5, 0],
    ["playoffs inside relegation", 10, 0, 5, 8, 3],
    ["half a playoff range", 10, 0, 3, null, 0],
  ])("rejects %s", async (_name, count, promotion, from, to, relegation) => {
    const league = await draftCustom("public", { teams: count as number });
    await expect(
      db.asUser(creator, "select public.save_season_format($1, $2, $3, $4, $5)", [
        league.season_id,
        promotion,
        from,
        to,
        relegation,
      ]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("has no direct write access to leagues, seasons, teams or memberships", async () => {
    const league = await customLeague();
    for (const sql of [
      `insert into public.leagues (name, type, season_id) values ('X', 'public', '${league.season_id}')`,
      `update public.leagues set name = 'X' where id = '${league.id}'`,
      `delete from public.leagues where id = '${league.id}'`,
      `update public.seasons set status = 'finished' where id = '${league.season_id}'`,
      `insert into public.teams (season_id, name) values ('${league.season_id}', 'X')`,
      `update public.teams set name = 'X' where season_id = '${league.season_id}'`,
      `insert into public.memberships (league_id, user_id, role) values ('${league.id}', '${alice}', 'player')`,
    ]) {
      await expect(db.asUser(creator, sql)).rejects.toThrow(/permission denied/);
    }
  });

  it("only publishes when the team count matches", async () => {
    const league = await draftCustom("public", { teams: 6 });
    await saveTeams(creator, league.season_id, named("Ash", "Birch"), 6);
    await expect(publish(creator, league.season_id)).rejects.toThrow(/team_count_must_match_teams/);
    await saveTeams(creator, league.season_id, named("Ash", "Birch", "Cedar", "Dale"), 4);
    await expect(publish(creator, league.season_id)).resolves.toBeDefined();
  });

  it("does not let other users publish or edit it", async () => {
    const league = await draftCustom();
    await expect(publish(alice, league.season_id)).rejects.toThrow(/league_not_found/);
    await expect(saveTeams(alice, league.season_id, named("Ash"), 4)).rejects.toThrow(/league_not_found/);
    await expect(
      db.asUser(alice, "select public.update_league_basics($1, 'Hacked', 'public', null, $2)", [
        league.id,
        FUTURE,
      ]),
    ).rejects.toThrow(/league_not_found/);
    await expect(db.asUser(alice, "select public.delete_league($1)", [league.id])).rejects.toThrow(
      /league_not_found/,
    );
  });

  it("takes its hidden season with it when deleted", async () => {
    const league = await draftCustom();
    await db.asUser(creator, "select public.delete_league($1)", [league.id]);
    const { rows } = await db.pg.query("select id from public.seasons where id = $1", [league.season_id]);
    expect(rows).toHaveLength(0);
  });
});

describe("saving a team list", () => {
  it("updates, adds and removes teams in one save", async () => {
    const { season_id } = await draftCustom();
    await saveTeams(creator, season_id, named("Ash", "Birch", "Cedar", "Dale"));
    const [ash, birch] = await teamsOf(season_id);
    await saveTeams(creator, season_id, [
      { id: ash.id, name: "Ash Town", colour_primary: "#112233" },
      { id: birch.id, name: "Birch" },
      { name: "Elm" },
      { name: "Fir" },
    ]);
    const teams = await teamsOf(season_id);
    expect(teams.map((team) => team.name)).toEqual(["Ash Town", "Birch", "Elm", "Fir"]);
    expect(teams[0]).toMatchObject({ id: ash.id, colour_primary: "#112233" });
  });

  it("lets teams swap names and reuse a removed team's name", async () => {
    const { season_id } = await draftCustom();
    await saveTeams(creator, season_id, named("Ash", "Birch", "Cedar", "Dale"));
    const [ash, birch, cedar, dale] = await teamsOf(season_id);
    await saveTeams(creator, season_id, [
      { id: ash.id, name: "Birch" },
      { id: birch.id, name: "Ash" },
      { id: cedar.id, name: "Cedar" },
      { name: "Dale" },
    ]);
    const teams = await teamsOf(season_id);
    expect(teams.find((team) => team.name === "Birch")?.id).toBe(ash.id);
    expect(teams.find((team) => team.name === "Dale")?.id).not.toBe(dale.id);
    expect(teams).toHaveLength(4);
  });

  it("rejects duplicates, ignoring case and spaces, and rolls back on any invalid team", async () => {
    const { season_id } = await draftCustom();
    await saveTeams(creator, season_id, named("Ash", "Birch", "Cedar", "Dale"));
    await expect(saveTeams(creator, season_id, named("Elm", " ELM ", "Fir", "Oak"))).rejects.toThrow(
      /duplicate_team_name/,
    );
    await expect(
      saveTeams(creator, season_id, [...named("Elm", "Fir", "Oak"), { name: "Pine", colour_primary: "red" }]),
    ).rejects.toThrow(/violates check constraint/);
    expect((await teamsOf(season_id)).map((team) => team.name)).toEqual(["Ash", "Birch", "Cedar", "Dale"]);
  });

  it("rejects team ids and logos from another season", async () => {
    const mine = await draftCustom();
    const other = await draftCustom();
    await saveTeams(creator, other.season_id, named("Ash", "Birch", "Cedar", "Dale"));
    const [foreign] = await teamsOf(other.season_id);
    await expect(saveTeams(creator, mine.season_id, [{ id: foreign.id, name: "Stolen" }], 4)).rejects.toThrow(
      /invalid_teams/,
    );
    await expect(
      saveTeams(creator, mine.season_id, [{ name: "Ash", logo_path: `${other.season_id}/logo.webp` }], 4),
    ).rejects.toThrow(/invalid_teams/);
    await expect(
      saveTeams(creator, mine.season_id, [{ name: "Ash", logo_path: `${mine.season_id}/logo.webp` }], 4),
    ).resolves.toBeDefined();
  });

  it("keeps predictions valid when teams are only renamed", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await submit(alice, league.season_id, league.teams);
    await saveTeams(
      creator,
      league.season_id,
      league.teams.map((id, index) => ({ id, name: `Renamed ${index}` })),
    );
    const { rows } = await db.pg.query<{ needs_review: boolean }>(
      "select needs_review from public.predictions where season_id = $1",
      [league.season_id],
    );
    expect(rows[0].needs_review).toBe(false);
  });

  it("flags predictions and syncs the count when the set of teams changes", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await submit(alice, league.season_id, league.teams);
    const existing = await teamsOf(league.season_id);
    await saveTeams(creator, league.season_id, [
      ...existing.map((team) => ({ id: team.id, name: team.name })),
      { name: "Elm" },
    ]);
    const { rows } = await db.pg.query<{ needs_review: boolean; team_count: number }>(
      `select p.needs_review, s.team_count from public.predictions p
       join public.seasons s on s.id = p.season_id where p.season_id = $1`,
      [league.season_id],
    );
    expect(rows[0]).toEqual({ needs_review: true, team_count: 5 });
    await expect(submit(alice, league.season_id, league.teams)).rejects.toThrow(/invalid_team_order/);
  });

  it("lets a team at the minimum be swapped, but not drop below it", async () => {
    const league = await customLeague();
    const existing = await teamsOf(league.season_id);
    await expect(
      saveTeams(creator, league.season_id, existing.slice(0, 3).map(({ id, name }) => ({ id, name }))),
    ).rejects.toThrow(/team_count_out_of_range/);
    await saveTeams(creator, league.season_id, [
      ...existing.slice(0, 3).map(({ id, name }) => ({ id, name })),
      { name: "Elm" },
    ]);
    expect(await teamsOf(league.season_id)).toHaveLength(4);
  });
});

describe("official leagues", () => {
  it("can only be created by admins", async () => {
    await expect(
      db.asUser(alice, "select public.create_official_season('Football', 'Premier League', '2026-27', 20, $1)", [FUTURE]),
    ).rejects.toThrow(/admin_only/);
    await expect(
      db.asUser(null, "select public.create_official_season('Football', 'Premier League', '2026-27', 20, $1)", [FUTURE]),
    ).rejects.toThrow(/permission denied/);
  });

  it("has no owner, and doesn't add the admin as a member", async () => {
    const league = await officialSeason();
    const { rows } = await db.pg.query<{ created_by: string | null; type: string; name: string }>(
      "select created_by, type, name from public.leagues where id = $1",
      [league.id],
    );
    expect(rows[0]).toEqual({ created_by: null, type: "official", name: "Premier League 2026-27" });
    const members = await db.pg.query("select 1 from public.memberships where league_id = $1", [league.id]);
    expect(members.rows).toHaveLength(0);
  });

  it("reuses sports and competitions, ignoring case, and refuses duplicate seasons", async () => {
    await officialSeason("2026-27");
    await officialSeason("2027-28");
    await db.asUser(admin, "select public.create_official_season('FOOTBALL', 'La Liga', '2026-27', 20, $1)", [FUTURE]);
    const counts = await db.pg.query<{ sports: number; competitions: number }>(
      "select (select count(*)::int from public.sports) as sports, (select count(*)::int from public.competitions) as competitions",
    );
    expect(counts.rows[0]).toEqual({ sports: 1, competitions: 2 });
    await expect(officialSeason("2026-27")).rejects.toThrow(/season_already_exists/);
  });

  it("fits a long competition name and season label into the league name", async () => {
    const longName = "C".repeat(60);
    const league = await officialSeason("2026-27", longName);
    const { rows } = await db.pg.query<{ name: string }>("select name from public.leagues where id = $1", [
      league.id,
    ]);
    expect(rows[0].name).toHaveLength(60);
  });

  it("allows only one official league per season", async () => {
    const league = await officialSeason();
    await expect(
      db.pg.query(
        "insert into public.leagues (name, type, season_id, created_by) values ('Second', 'official', $1, null)",
        [league.season_id],
      ),
    ).rejects.toThrow(/one_official_league_per_season/);
  });

  it("can be managed by any admin, and by nobody else", async () => {
    const secondAdmin = await db.createUser("Second Admin", { admin: true });
    const league = await officialSeason();
    const existing = await teamsOf(league.season_id);
    const rename = existing.map(({ id }, index) => ({ id, name: `Club ${index}` }));
    await expect(saveTeams(secondAdmin, league.season_id, rename)).resolves.toBeDefined();
    await expect(saveTeams(alice, league.season_id, rename)).rejects.toThrow(/league_not_found/);
    await expect(
      db.asUser(alice, "select public.save_season_format($1, 1, null, null, 0)", [league.season_id]),
    ).rejects.toThrow(/league_not_found/);
    await db.passDeadline(league.season_id);
    await expect(updateStandings(alice, league.season_id, league.teams)).rejects.toThrow(/league_not_found/);
    await expect(updateStandings(secondAdmin, league.season_id, league.teams)).resolves.toBeDefined();
  });

  it("hides drafts from everyone except admins", async () => {
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Draft Cup', '2026', 4, $1) as id",
      [FUTURE],
    );
    const sql = "select id from public.league_details where id = $1";
    expect(await db.asUser(admin, sql, [id])).toHaveLength(1);
    expect(await db.asUser(alice, sql, [id])).toHaveLength(0);
    expect(await db.asUser(null, sql, [id])).toHaveLength(0);
  });

  it("is visible to everyone once published, with its competition details", async () => {
    const league = await officialSeason();
    const rows = await db.asUser<Record<string, unknown>>(
      null,
      "select sport, competition_name, season_label, status from public.league_details where id = $1",
      [league.id],
    );
    expect(rows).toEqual([
      { sport: "Football", competition_name: "Premier League", season_label: "2026-27", status: "published" },
    ]);
  });

  it("copies teams and zones from a previous season, but not its deadline or standings", async () => {
    const previous = await officialSeason("2026-27");
    await db.asUser(admin, "select public.save_season_format($1, 1, null, null, 1)", [previous.season_id]);
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Premier League', '2027-28', 4, '2100-01-01', $1) as id",
      [previous.season_id],
    );
    const next = await infoOf(id);
    expect((await teamsOf(next.season_id)).map((team) => team.name)).toEqual(teamNames(4));
    const { rows } = await db.pg.query<{ promotion_count: number; relegation_count: number; status: string; year: string }>(
      "select promotion_count, relegation_count, status, to_char(deadline, 'YYYY') as year from public.seasons where id = $1",
      [next.season_id],
    );
    expect(rows[0]).toEqual({ promotion_count: 1, relegation_count: 1, status: "draft", year: "2100" });

    const [firstOld] = await teamsOf(previous.season_id);
    const [firstNew] = await teamsOf(next.season_id);
    expect(firstNew.id).not.toBe(firstOld.id);
  });

  it("only copies from the same competition", async () => {
    const other = await officialSeason("2026-27", "La Liga");
    await expect(
      db.asUser(admin, "select public.create_official_season('Football', 'Premier League', '2027-28', 4, $1, $2)", [
        FUTURE,
        other.season_id,
      ]),
    ).rejects.toThrow(/season_to_copy_not_found/);
  });

  it("lets a copied team keep its old logo, but no one borrow another's", async () => {
    const previous = await officialSeason("2026-27");
    const [first, ...rest] = await teamsOf(previous.season_id);
    const logo = `${previous.season_id}/logo.webp`;
    await saveTeams(admin, previous.season_id, [
      { id: first.id, name: first.name, logo_path: logo },
      ...rest.map(({ id, name }) => ({ id, name })),
    ]);
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Premier League', '2027-28', 4, $1, $2) as id",
      [FUTURE, previous.season_id],
    );
    const next = await infoOf(id);
    const copied = await teamsOf(next.season_id);
    expect(copied[0].logo_path).toBe(logo);
    await expect(
      saveTeams(admin, next.season_id, copied.map(({ id: teamId, name, logo_path }) => ({ id: teamId, name, logo_path }))),
    ).resolves.toBeDefined();
    await expect(
      saveTeams(admin, next.season_id, [
        { id: copied[1].id, name: copied[1].name, logo_path: logo },
        ...copied.filter((team) => team.id !== copied[1].id).map(({ id: teamId, name }) => ({ id: teamId, name })),
      ]),
    ).rejects.toThrow(/invalid_teams/);
  });

  it("can't be deleted while other leagues rely on its season", async () => {
    const league = await officialSeason();
    const friends = await presetLeague(league.season_id);
    await expect(db.asUser(admin, "select public.delete_league($1)", [league.id])).rejects.toThrow(
      /season_has_other_leagues/,
    );
    await db.asUser(creator, "select public.delete_league($1)", [friends.id]);
    await db.asUser(admin, "select public.delete_league($1)", [league.id]);
    const { rows } = await db.pg.query("select id from public.seasons where id = $1", [league.season_id]);
    expect(rows).toHaveLength(0);
  });
});

describe("preset leagues", () => {
  it("attach to the official season and belong to their creator", async () => {
    const official = await officialSeason();
    const league = await presetLeague(official.season_id);
    expect(league.season_id).toBe(official.season_id);
    const rows = await db.asUser<{ created_by: string; type: string; team_count: number }>(
      creator,
      "select created_by, type, team_count from public.league_details where id = $1",
      [league.id],
    );
    expect(rows).toEqual([{ created_by: creator, type: "private", team_count: 4 }]);
  });

  it("are only available for published, upcoming, unhidden official seasons", async () => {
    const custom = await customLeague();
    await expect(presetLeague(custom.season_id)).rejects.toThrow(/preset_not_available/);

    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Draft Cup', '2026', 4, $1) as id",
      [FUTURE],
    );
    await expect(presetLeague((await infoOf(id)).season_id)).rejects.toThrow(/preset_not_available/);

    const hidden = await officialSeason("2030");
    await db.asUser(admin, "select public.set_league_hidden($1, true)", [hidden.id]);
    await expect(presetLeague(hidden.season_id)).rejects.toThrow(/preset_not_available/);

    const started = await officialSeason("2031");
    await db.passDeadline(started.season_id);
    await expect(presetLeague(started.season_id)).rejects.toThrow(/preset_not_available/);
  });

  it("can't be official", async () => {
    const official = await officialSeason();
    await expect(
      db.asUser(creator, "select public.create_preset_league($1, 'X', 'official')", [official.season_id]),
    ).rejects.toThrow(/official_leagues_need_a_competition/);
  });

  it("let the creator change the name and privacy, but not teams, zones or the deadline", async () => {
    const official = await officialSeason();
    const league = await presetLeague(official.season_id);

    await db.asUser(creator, "select public.update_league_basics($1, 'Renamed', 'public', null, '2050-01-01')", [
      league.id,
    ]);
    const { rows } = await db.pg.query<{ name: string; type: string; year: string }>(
      "select name, type, to_char(deadline, 'YYYY') as year from public.league_details where id = $1",
      [league.id],
    );
    expect(rows[0]).toEqual({ name: "Renamed", type: "public", year: "2099" });

    await expect(saveTeams(creator, official.season_id, named("A", "B", "C", "D"))).rejects.toThrow(
      /league_not_found/,
    );
    await expect(
      db.asUser(creator, "select public.save_season_format($1, 1, null, null, 0)", [official.season_id]),
    ).rejects.toThrow(/league_not_found/);
    await db.passDeadline(official.season_id);
    await expect(updateStandings(creator, official.season_id, official.teams)).rejects.toThrow(
      /league_not_found/,
    );
  });

  it("leave the season and predictions intact when deleted", async () => {
    const official = await officialSeason();
    const league = await presetLeague(official.season_id);
    await submit(creator, official.season_id, official.teams);
    await db.asUser(creator, "select public.delete_league($1)", [league.id]);
    const season = await db.pg.query("select id from public.seasons where id = $1", [official.season_id]);
    const prediction = await db.pg.query("select id from public.predictions where season_id = $1", [
      official.season_id,
    ]);
    expect(season.rows).toHaveLength(1);
    expect(prediction.rows).toHaveLength(1);
  });

  it("show official standings and scores as soon as admins update them", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    await join(alice, friends.id, friends.join_code);
    await submit(alice, official.season_id, official.teams);
    await db.passDeadline(official.season_id);

    expect((await leaderboard(alice, friends.id))[0]).toMatchObject({ user_id: alice, rank: null, total_points: null });
    await updateStandings(admin, official.season_id, official.teams);

    const standings = await db.asUser<{ team_order: string[] }>(
      alice,
      "select team_order from public.standings_updates where season_id = $1",
      [official.season_id],
    );
    expect(standings[0].team_order).toEqual(official.teams);
    expect((await leaderboard(alice, friends.id))[0]).toMatchObject({ user_id: alice, rank: 1, total_points: 26 });
  });
});

describe("one prediction per season", () => {
  it("counts the same table in every league on the season", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    await join(alice, official.id);
    await join(alice, friends.id, friends.join_code);
    await submit(alice, official.season_id, official.teams);
    const reversed = [...official.teams].reverse();
    await submit(alice, official.season_id, reversed);

    const { rows } = await db.pg.query<{ team_order: string[] }>(
      "select team_order from public.predictions where season_id = $1 and user_id = $2",
      [official.season_id, alice],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].team_order).toEqual(reversed);

    await db.passDeadline(official.season_id);
    await updateStandings(admin, official.season_id, reversed);
    expect((await leaderboard(alice, official.id))[0].total_points).toBe(26);
    expect((await leaderboard(alice, friends.id))[0].total_points).toBe(26);
  });

  it("ranks within each league, so the same score can place differently", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    const [a, b, c, d] = official.teams;
    await join(alice, official.id);
    await join(alice, friends.id, friends.join_code);
    await join(bob, official.id);
    await submit(alice, official.season_id, [a, b, d, c]);
    await submit(bob, official.season_id, [a, b, c, d]);
    await db.passDeadline(official.season_id);
    await updateStandings(admin, official.season_id, official.teams);

    const rank = async (leagueId: string, user: string) =>
      (await leaderboard(user, leagueId)).find((row) => row.user_id === user)?.rank;
    expect(await rank(official.id, alice)).toBe(2);
    expect(await rank(friends.id, alice)).toBe(1);
    expect((await leaderboard(alice, friends.id)).map((row) => row.user_id)).not.toContain(bob);
  });

  it("keeps seasons separate, so a new season needs a new prediction", async () => {
    const thisYear = await officialSeason("2026-27");
    const nextYear = await officialSeason("2027-28");
    await join(alice, thisYear.id);
    await join(alice, nextYear.id);
    await submit(alice, thisYear.season_id, thisYear.teams);
    const { rows } = await db.pg.query("select id from public.predictions where season_id = $1", [
      nextYear.season_id,
    ]);
    expect(rows).toHaveLength(0);
    await expect(submit(alice, nextYear.season_id, thisYear.teams)).rejects.toThrow(/invalid_team_order/);
  });

  it("flags the prediction everywhere when official teams change", async () => {
    const official = await officialSeason();
    await join(alice, official.id);
    await submit(alice, official.season_id, official.teams);
    const existing = await teamsOf(official.season_id);
    await saveTeams(admin, official.season_id, [
      ...existing.slice(0, 3).map(({ id, name }) => ({ id, name })),
      { name: "Promoted FC" },
    ]);
    const { rows } = await db.pg.query<{ needs_review: boolean }>(
      "select needs_review from public.predictions where season_id = $1",
      [official.season_id],
    );
    expect(rows[0].needs_review).toBe(true);
  });

  it("lets a locked table count in a league joined after the deadline", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    await join(alice, official.id);
    await submit(alice, official.season_id, official.teams);
    await db.passDeadline(official.season_id);

    expect((await join(alice, friends.id, friends.join_code))[0].join_league).toBe("player");
    await updateStandings(admin, official.season_id, official.teams);
    expect((await leaderboard(alice, friends.id)).map((row) => row.user_id)).toContain(alice);
  });

  it("makes people with no table spectators after the deadline", async () => {
    const official = await officialSeason();
    await db.passDeadline(official.season_id);
    expect((await join(bob, official.id))[0].join_league).toBe("spectator");
    await expect(submit(bob, official.season_id, official.teams)).rejects.toThrow(/deadline_passed/);
  });
});

describe("league visibility", () => {
  it("hides custom drafts from everyone but the creator and admins", async () => {
    const { id } = await draftCustom();
    const sql = "select id from public.leagues where id = $1";
    expect(await db.asUser(creator, sql, [id])).toHaveLength(1);
    expect(await db.asUser(admin, sql, [id])).toHaveLength(1);
    expect(await db.asUser(alice, sql, [id])).toHaveLength(0);
    expect(await db.asUser(null, sql, [id])).toHaveLength(0);
  });

  it("shows public leagues to everyone, including signed-out visitors", async () => {
    const league = await customLeague();
    expect(await db.asUser(null, "select id from public.leagues where id = $1", [league.id])).toHaveLength(1);
    expect(await db.asUser(null, "select id from public.teams where season_id = $1", [league.season_id])).toHaveLength(4);
  });

  it("hides private leagues and their teams from non-members", async () => {
    const league = await customLeague("private");
    expect(await db.asUser(alice, "select id from public.leagues where id = $1", [league.id])).toHaveLength(0);
    expect(await db.asUser(null, "select id from public.league_details where id = $1", [league.id])).toHaveLength(0);
    expect(await db.asUser(alice, "select id from public.teams where season_id = $1", [league.season_id])).toHaveLength(0);
    expect(await db.asUser(alice, "select id from public.seasons where id = $1", [league.season_id])).toHaveLength(0);
  });

  it("doesn't reveal friends' private preset leagues through the shared season", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    expect(await db.asUser(alice, "select id from public.leagues where id = $1", [friends.id])).toHaveLength(0);
    expect(await db.asUser(alice, "select id from public.seasons where id = $1", [official.season_id])).toHaveLength(1);
  });

  it("shows a preview for a valid code only, in any case and to signed-out visitors", async () => {
    const league = await customLeague("private");
    const sql = "select * from public.get_league_preview($1)";
    const rows = await db.asUser<Record<string, unknown>>(null, sql, [` ${league.join_code.toLowerCase()} `]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: league.id, name: "Test League", creator_name: "Creator", sport: "Football" });
    expect(rows[0]).not.toHaveProperty("join_code");
    expect(await db.asUser(null, sql, ["WRONGCOD"])).toHaveLength(0);
  });

  it("does not preview drafts", async () => {
    const league = await draftCustom("private");
    expect(await db.asUser(null, "select * from public.get_league_preview($1)", [league.join_code])).toHaveLength(0);
  });

  it("removes hidden leagues for everyone but admins and the creator", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await db.asUser(admin, "select public.set_league_hidden($1, true)", [league.id]);
    const sql = "select id from public.leagues where id = $1";
    expect(await db.asUser(alice, sql, [league.id])).toHaveLength(0);
    expect(await db.asUser(null, sql, [league.id])).toHaveLength(0);
    expect(await db.asUser(admin, sql, [league.id])).toHaveLength(1);
    expect(await db.asUser(null, "select * from public.get_league_preview($1)", [league.join_code])).toHaveLength(0);
    await expect(submit(alice, league.season_id, league.teams)).rejects.toThrow(/league_not_found/);

    await db.asUser(admin, "select public.set_league_hidden($1, false)", [league.id]);
    expect(await db.asUser(alice, sql, [league.id])).toHaveLength(1);
  });

  it("only lets admins hide leagues", async () => {
    const league = await customLeague();
    await expect(db.asUser(creator, "select public.set_league_hidden($1, true)", [league.id])).rejects.toThrow(
      /admin_only/,
    );
  });
});

describe("joining", () => {
  it("lets anyone join public and official leagues as a player", async () => {
    const league = await customLeague();
    expect((await join(alice, league.id))[0].join_league).toBe("player");
    const official = await officialSeason();
    expect((await join(alice, official.id))[0].join_league).toBe("player");
  });

  it("requires a signed-in user", async () => {
    const league = await customLeague();
    await expect(db.asUser(null, "select public.join_league($1)", [league.id])).rejects.toThrow(/permission denied/);
  });

  it("requires the right code for a private league", async () => {
    const league = await customLeague("private");
    await expect(join(alice, league.id)).rejects.toThrow(/league_not_found/);
    await expect(join(alice, league.id, "WRONGCOD")).rejects.toThrow(/league_not_found/);
    expect((await join(alice, league.id, league.join_code))[0].join_league).toBe("player");
    expect(await db.asUser(alice, "select id from public.leagues where id = $1", [league.id])).toHaveLength(1);
  });

  it("stops an old code working after rotation, for new joiners only", async () => {
    const league = await customLeague("private");
    await join(alice, league.id, league.join_code);
    await db.asUser(creator, "select public.rotate_join_code($1)", [league.id]);
    await expect(join(bob, league.id, league.join_code)).rejects.toThrow(/league_not_found/);
    await expect(join(alice, league.id)).resolves.toBeTruthy();
  });

  it("only lets the creator or an admin rotate the code", async () => {
    const league = await customLeague();
    await expect(db.asUser(alice, "select public.rotate_join_code($1)", [league.id])).rejects.toThrow(
      /league_not_found/,
    );
  });

  it("still requires the code to spectate a private league", async () => {
    const league = await customLeague("private");
    await db.passDeadline(league.season_id);
    await expect(join(alice, league.id)).rejects.toThrow(/league_not_found/);
    expect((await join(alice, league.id, league.join_code))[0].join_league).toBe("spectator");
  });

  it("keeps an existing role when joining twice", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await db.passDeadline(league.season_id);
    expect((await join(alice, league.id))[0].join_league).toBe("player");
  });

  it("cannot join a draft", async () => {
    const league = await draftCustom();
    await expect(join(alice, league.id)).rejects.toThrow(/league_not_found/);
  });
});

describe("predictions", () => {
  it("saves a prediction and lets the player replace it before the deadline", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await submit(alice, league.season_id, league.teams);
    await submit(alice, league.season_id, [...league.teams].reverse());
    const rows = await db.asUser<{ team_order: string[] }>(
      alice,
      "select team_order from public.predictions where season_id = $1 and user_id = $2",
      [league.season_id, alice],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].team_order).toEqual([...league.teams].reverse());
  });

  it("rejects submissions after the deadline", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await submit(alice, league.season_id, league.teams);
    await db.passDeadline(league.season_id);
    await expect(submit(alice, league.season_id, [...league.teams].reverse())).rejects.toThrow(/deadline_passed/);
  });

  it("does not allow predictions to be written directly", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await expect(
      db.asUser(alice, "insert into public.predictions (season_id, user_id, team_order) values ($1, $2, $3)", [
        league.season_id,
        alice,
        league.teams,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects orders without each team exactly once", async () => {
    const league = await customLeague();
    const other = await customLeague();
    await join(alice, league.id);
    const [a, b, c] = league.teams;
    for (const order of [
      league.teams.slice(0, 3),
      [...league.teams, a],
      [a, a, b, c],
      [a, b, c, other.teams[0]],
      [],
    ]) {
      await expect(submit(alice, league.season_id, order)).rejects.toThrow(/invalid_team_order/);
    }
    await expect(
      db.asUser(alice, "select public.submit_prediction($1, array[$2::uuid, $3::uuid, $4::uuid, null])", [
        league.season_id,
        a,
        b,
        c,
      ]),
    ).rejects.toThrow(/invalid_team_order/);
  });

  it("requires membership", async () => {
    const league = await customLeague();
    await expect(submit(alice, league.season_id, league.teams)).rejects.toThrow(/not_a_player/);
  });

  it("rejects submissions to drafts", async () => {
    const draft = await draftCustom();
    await saveTeams(creator, draft.season_id, named("A", "B", "C", "D"));
    const teams = (await teamsOf(draft.season_id)).map((team) => team.id);
    await expect(submit(creator, draft.season_id, teams)).rejects.toThrow(/league_not_open/);
  });

  it("hides other players' picks until the deadline, then reveals them", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await join(bob, league.id);
    await submit(alice, league.season_id, league.teams);
    await submit(bob, league.season_id, league.teams);
    const sql = "select user_id from public.predictions where season_id = $1";

    expect(await db.asUser(alice, sql, [league.season_id])).toEqual([{ user_id: alice }]);
    expect(await db.asUser(outsider, sql, [league.season_id])).toHaveLength(0);
    expect(await db.asUser(creator, sql, [league.season_id])).toHaveLength(0);

    await db.passDeadline(league.season_id);

    expect(await db.asUser(alice, sql, [league.season_id])).toHaveLength(2);
    expect(await db.asUser(outsider, sql, [league.season_id])).toHaveLength(2);
  });

  it("does not reveal picks to signed-out visitors", async () => {
    const league = await customLeague();
    await db.passDeadline(league.season_id);
    await expect(
      db.asUser(null, "select user_id from public.predictions where season_id = $1", [league.season_id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps private league picks from outsiders after the deadline", async () => {
    const league = await customLeague("private");
    await join(alice, league.id, league.join_code);
    await submit(alice, league.season_id, league.teams);
    await db.passDeadline(league.season_id);
    const sql = "select user_id from public.predictions where season_id = $1";
    expect(await db.asUser(outsider, sql, [league.season_id])).toHaveLength(0);
    await join(bob, league.id, league.join_code);
    expect(await db.asUser(bob, sql, [league.season_id])).toHaveLength(1);
  });

  it("doesn't expose a player's picks through a shared season unless their league is visible", async () => {
    const official = await officialSeason();
    const friends = await presetLeague(official.season_id);
    await join(alice, friends.id, friends.join_code);
    await submit(alice, official.season_id, official.teams);
    await join(bob, official.id);
    await db.passDeadline(official.season_id);

    // Alice only plays in a private league, so Bob, who is only in the official one, can't see her table.
    const sql = "select user_id from public.predictions where season_id = $1 and user_id = $2";
    expect(await db.asUser(bob, sql, [official.season_id, alice])).toHaveLength(0);

    await join(alice, official.id);
    expect(await db.asUser(bob, sql, [official.season_id, alice])).toHaveLength(1);
  });
});

describe("after the deadline", () => {
  it("locks the league and its teams", async () => {
    const league = await customLeague();
    await db.passDeadline(league.season_id);
    await expect(
      db.asUser(creator, "select public.update_league_basics($1, 'Late', 'public', null, '2099-06-01')", [league.id]),
    ).rejects.toThrow(/league_locked_after_deadline/);
    await expect(saveTeams(creator, league.season_id, named("A", "B", "C", "D"))).rejects.toThrow(/league_not_found/);
    await expect(db.asUser(creator, "select public.delete_league($1)", [league.id])).rejects.toThrow(/league_not_found/);
  });

  it("blocks reopening at the database level, even for admins", async () => {
    const league = await customLeague();
    await db.passDeadline(league.season_id);
    await expect(
      db.pg.query("update public.seasons set deadline = '2099-06-01' where id = $1", [league.season_id]),
    ).rejects.toThrow(/league_locked_after_deadline/);
  });

  it("lets the deadline move until it passes, but never into the past", async () => {
    const league = await customLeague();
    await db.asUser(creator, "select public.update_league_basics($1, 'Test League', 'public', null, '2098-01-01')", [league.id]);
    await expect(
      db.asUser(creator, "select public.update_league_basics($1, 'Test League', 'public', null, now() - interval '1 day')", [league.id]),
    ).rejects.toThrow(/deadline_must_be_in_the_future/);
  });

  it("lets admins delete any league", async () => {
    const league = await customLeague();
    await db.passDeadline(league.season_id);
    await db.asUser(admin, "select public.delete_league($1)", [league.id]);
    expect((await db.pg.query("select id from public.leagues where id = $1", [league.id])).rows).toHaveLength(0);
  });
});

describe("scoring function", () => {
  const score = async (
    predicted: string[],
    actual: string[],
    zones: [number, number | null, number | null, number] = [0, null, null, 0],
  ) => {
    const { rows } = await db.pg.query<{ base_points: number; bonus_points: number; exact_count: number }>(
      "select * from private.score_prediction($1::uuid[], $2::uuid[], $3, $4, $5, $6)",
      [predicted, actual, ...zones],
    );
    return rows[0];
  };
  const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const moved = (from: number, to: number) => {
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  };

  it("matches the examples in the spec for a team predicted 3rd", async () => {
    expect((await score(ids, ids)).base_points).toBe(400);
    expect((await score(ids, moved(2, 4))).base_points).toBe(400 - 2 - 1 - 1);
    expect((await score(ids, moved(2, 19))).base_points).toBe(400 - 17 - 17);
  });

  it("gives a perfect 20-team table every point, using the spec's zones", async () => {
    expect(await score(ids, ids, [2, 3, 6, 3])).toEqual({ base_points: 400, bonus_points: 47, exact_count: 20 });
  });

  it("only awards the champion bonus when zones are off", async () => {
    expect((await score(ids, ids)).bonus_points).toBe(10);
  });

  it("awards zone bonuses for the right zone, even at the wrong position", async () => {
    const actual = [...ids];
    [actual[0], actual[1]] = [actual[1], actual[0]];
    expect((await score(ids, actual, [2, null, null, 0])).bonus_points).toBe(10);
  });

  it("gives no bonus when a team leaves its zone", async () => {
    const actual = [...ids];
    [actual[1], actual[2]] = [actual[2], actual[1]];
    expect((await score(ids, actual, [2, null, null, 0])).bonus_points).toBe(15);
  });
});

describe("standings and the leaderboard", () => {
  async function liveLeague() {
    const league = await customLeague();
    await join(alice, league.id);
    await join(bob, league.id);
    return league;
  }

  it("only lets the season's manager update standings", async () => {
    const { season_id, teams } = await liveLeague();
    await db.passDeadline(season_id);
    await expect(updateStandings(alice, season_id, teams)).rejects.toThrow(/league_not_found/);
    await expect(updateStandings(creator, season_id, teams)).resolves.toBeTruthy();
    await expect(updateStandings(admin, season_id, teams)).resolves.toBeTruthy();
  });

  it("does not accept standings before the deadline or incomplete tables", async () => {
    const { season_id, teams } = await liveLeague();
    await expect(updateStandings(creator, season_id, teams)).rejects.toThrow(/deadline_not_reached/);
    await db.passDeadline(season_id);
    await expect(updateStandings(creator, season_id, teams.slice(1))).rejects.toThrow(/invalid_team_order/);
  });

  it("does not allow scores or standings to be written directly", async () => {
    const { season_id, teams } = await liveLeague();
    await submit(alice, season_id, teams);
    await db.passDeadline(season_id);
    await updateStandings(creator, season_id, teams);
    await expect(db.asUser(alice, "update public.prediction_scores set base_points = 9999")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.asUser(creator, "insert into public.standings_updates (season_id, version, team_order) values ($1, 99, $2)", [
        season_id,
        teams,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("scores and ranks players, breaking ties on exact positions", async () => {
    const { id, season_id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await join(outsider, id);
    await submit(alice, season_id, [a, b, c, d]); // perfect: 16 base + 10 champion
    await submit(bob, season_id, [b, a, d, c]); // each team one off: 12 base, 0 exact
    await submit(creator, season_id, [a, b, d, c]); // 2 exact, 2 one off: 14 base + 10 champion
    await db.passDeadline(season_id);
    await updateStandings(creator, season_id, teams);

    const rows = await leaderboard(alice, id);
    const byUser = (user: string) => rows.find((row) => row.user_id === user);
    expect(byUser(alice)).toMatchObject({ base_points: 16, bonus_points: 10, total_points: 26, exact_count: 4, rank: 1 });
    expect(byUser(creator)).toMatchObject({ base_points: 14, bonus_points: 10, exact_count: 2, rank: 2 });
    expect(byUser(bob)).toMatchObject({ base_points: 12, bonus_points: 0, exact_count: 0, rank: 3 });
    expect(byUser(outsider)).toBeUndefined();
  });

  it("shares a rank when players are still level", async () => {
    const { id, season_id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await join(outsider, id);
    await submit(alice, season_id, [a, b, c, d]);
    await submit(bob, season_id, [a, b, c, d]);
    await submit(outsider, season_id, [d, c, b, a]);
    await db.passDeadline(season_id);
    await updateStandings(creator, season_id, teams);

    const rows = await leaderboard(alice, id);
    expect(rows.find((row) => row.user_id === alice)?.rank).toBe(1);
    expect(rows.find((row) => row.user_id === bob)?.rank).toBe(1);
    expect(rows.find((row) => row.user_id === outsider)?.rank).toBe(3);
  });

  it("tracks rank movement and keeps only two sets of scores", async () => {
    const { id, season_id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await submit(alice, season_id, [a, b, c, d]);
    await submit(bob, season_id, [d, c, b, a]);
    await db.passDeadline(season_id);

    const aliceRow = async () => (await leaderboard(alice, id)).find((row) => row.user_id === alice);

    await updateStandings(creator, season_id, [a, b, c, d]);
    expect(await aliceRow()).toMatchObject({ rank: 1, previous_rank: null });
    await updateStandings(creator, season_id, [d, c, b, a]);
    expect(await aliceRow()).toMatchObject({ rank: 2, previous_rank: 1 });
    await updateStandings(creator, season_id, [a, b, c, d]);
    expect(await aliceRow()).toMatchObject({ rank: 1, previous_rank: 2 });

    const { rows } = await db.pg.query<{ versions: number }>(
      `select count(distinct s.standings_update_id)::int as versions
       from public.prediction_scores s
       join public.standings_updates u on u.id = s.standings_update_id
       where u.season_id = $1`,
      [season_id],
    );
    expect(rows[0].versions).toBe(2);

    const history = await db.asUser<{ version: number; updated_by: string }>(
      alice,
      "select version, updated_by from public.standings_updates where season_id = $1 order by version",
      [season_id],
    );
    expect(history.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(history[0].updated_by).toBe(creator);
  });

  it("leaves predictions awaiting review off the leaderboard", async () => {
    const league = await customLeague("public", 5);
    await join(alice, league.id);
    await submit(alice, league.season_id, league.teams);
    const existing = await teamsOf(league.season_id);
    await saveTeams(creator, league.season_id, existing.slice(0, 4).map(({ id, name }) => ({ id, name })));
    await db.passDeadline(league.season_id);
    await updateStandings(creator, league.season_id, league.teams.slice(0, 4));
    expect(await leaderboard(alice, league.id)).toHaveLength(0);
  });

  it("hides who has entered until the deadline", async () => {
    const { id, season_id, teams } = await liveLeague();
    await submit(alice, season_id, teams);
    expect(await leaderboard(alice, id)).toEqual([]);
  });

  it("lists locked-in players with no points before the first update", async () => {
    const { id, season_id, teams } = await liveLeague();
    await submit(alice, season_id, teams);
    await submit(bob, season_id, teams);
    await db.passDeadline(season_id);

    const rows = await leaderboard(alice, id);
    expect(rows.map((row) => row.user_id)).toEqual([alice, bob]);
    expect(rows[0]).toMatchObject({ rank: null, total_points: null, previous_rank: null, entry_count: 2 });
  });

  it("keeps ranks and the player count when reading one row or one page", async () => {
    const { id, season_id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await submit(alice, season_id, [a, b, c, d]);
    await submit(bob, season_id, [d, c, b, a]);
    await db.passDeadline(season_id);
    await updateStandings(creator, season_id, teams);

    const own = await db.asUser<BoardRow & { entry_count: number }>(
      bob,
      "select * from public.league_leaderboard($1) where user_id = $2",
      [id, bob],
    );
    expect(own[0]).toMatchObject({ rank: 2, entry_count: 2 });
    const second = await db.asUser<BoardRow>(
      alice,
      "select * from public.league_leaderboard($1) limit 1 offset 1",
      [id],
    );
    expect(second[0].user_id).toBe(bob);
  });

  it("lets anyone signed out read a public leaderboard, but not the picks behind it", async () => {
    const { id, season_id, teams } = await liveLeague();
    await submit(alice, season_id, teams);
    await db.passDeadline(season_id);
    expect(await leaderboard(null as unknown as string, id)).toHaveLength(1);
    await expect(
      db.asUser(null, "select team_order from public.predictions where season_id = $1", [season_id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("won't show the leaderboard of a league you can't see", async () => {
    const league = await customLeague("private");
    await expect(leaderboard(alice, league.id)).rejects.toThrow(/league_not_found/);
  });

  it("finishes only after standings exist, then stops further updates", async () => {
    const { season_id, teams } = await liveLeague();
    await expect(db.asUser(creator, "select public.finish_season($1)", [season_id])).rejects.toThrow(/league_not_live/);
    await db.passDeadline(season_id);
    await expect(db.asUser(creator, "select public.finish_season($1)", [season_id])).rejects.toThrow(/no_standings_yet/);
    await updateStandings(creator, season_id, teams);
    await expect(db.asUser(alice, "select public.finish_season($1)", [season_id])).rejects.toThrow(/league_not_found/);
    await db.asUser(creator, "select public.finish_season($1)", [season_id]);
    await expect(updateStandings(creator, season_id, teams)).rejects.toThrow(/league_not_live/);
  });

  it("only lets admins reopen a finished season", async () => {
    const { season_id, teams } = await liveLeague();
    await db.passDeadline(season_id);
    await updateStandings(creator, season_id, teams);
    await db.asUser(creator, "select public.finish_season($1)", [season_id]);
    await expect(db.asUser(creator, "select public.reopen_season($1)", [season_id])).rejects.toThrow(/admin_only/);
    await db.asUser(admin, "select public.reopen_season($1)", [season_id]);
    await expect(updateStandings(creator, season_id, teams)).resolves.toBeTruthy();
  });
});

describe("reports", () => {
  const report = (user: string, leagueId: string, teamId: string | null = null) =>
    db.asUser(user, "insert into public.reports (league_id, team_id, reason) values ($1, $2, 'Offensive')", [
      leagueId,
      teamId,
    ]);

  it("lets users report what they can see", async () => {
    const league = await customLeague();
    await expect(report(alice, league.id, league.teams[0])).resolves.toBeDefined();
  });

  it("rejects reports on leagues the user can't see, or teams from other leagues", async () => {
    const hidden = await customLeague("private");
    await expect(report(alice, hidden.id)).rejects.toThrow(/row-level security/);
    const league = await customLeague();
    const other = await customLeague();
    await expect(report(alice, league.id, other.teams[0])).rejects.toThrow(/row-level security/);
  });

  it("only shows reports to their author and admins, and only admins can review them", async () => {
    const league = await customLeague();
    await report(alice, league.id);
    const sql = "select id from public.reports where league_id = $1";
    expect(await db.asUser(alice, sql, [league.id])).toHaveLength(1);
    expect(await db.asUser(bob, sql, [league.id])).toHaveLength(0);
    expect(await db.asUser(admin, sql, [league.id])).toHaveLength(1);

    await db.asUser(alice, "update public.reports set status = 'dismissed' where league_id = $1", [league.id]);
    await db.asUser(admin, "update public.reports set status = 'actioned' where league_id = $1", [league.id]);
    const { rows } = await db.pg.query<{ status: string }>("select status from public.reports where league_id = $1", [
      league.id,
    ]);
    expect(rows[0].status).toBe("actioned");
  });

  it("allows one open report per person for each league or team", async () => {
    const league = await customLeague();
    await report(alice, league.id);
    await expect(report(alice, league.id)).rejects.toThrow(/one_open_report/);
    await expect(report(alice, league.id, league.teams[0])).resolves.toBeDefined();
    await expect(report(alice, league.id, league.teams[0])).rejects.toThrow(/one_open_report/);
    await expect(report(bob, league.id)).resolves.toBeDefined();

    await db.asUser(admin, "select public.resolve_league_reports($1, false)", [league.id]);
    await expect(report(alice, league.id)).resolves.toBeDefined();
  });

  it("limits how many reports someone can send in a day", async () => {
    const league = await customLeague();
    await db.pg.query(
      `insert into public.reports (league_id, reported_by, reason, status)
       select $1, $2, 'Old', 'dismissed' from generate_series(1, 20)`,
      [league.id, alice],
    );
    await expect(report(alice, league.id)).rejects.toThrow(/report_limit_reached/);
    await expect(report(bob, league.id)).resolves.toBeDefined();
  });

  const statuses = async (leagueId: string) =>
    (
      await db.pg.query<{ status: string }>("select status from public.reports where league_id = $1", [leagueId])
    ).rows.map((row) => row.status);
  const hiddenAt = async (leagueId: string) =>
    (await db.pg.query<{ hidden_at: string | null }>("select hidden_at from public.leagues where id = $1", [leagueId]))
      .rows[0].hidden_at;

  it("dismisses every open report on a league without hiding it", async () => {
    const league = await customLeague();
    await report(alice, league.id);
    await report(bob, league.id);
    await db.asUser(admin, "select public.resolve_league_reports($1, false)", [league.id]);
    expect(await statuses(league.id)).toEqual(["dismissed", "dismissed"]);
    expect(await hiddenAt(league.id)).toBeNull();
  });

  it("hides a league and closes its reports, which takes it away from players", async () => {
    const league = await customLeague();
    await join(alice, league.id);
    await report(bob, league.id);
    await db.asUser(admin, "select public.resolve_league_reports($1, true)", [league.id]);
    expect(await statuses(league.id)).toEqual(["actioned"]);
    expect(await hiddenAt(league.id)).not.toBeNull();

    const visible = "select id from public.league_details where id = $1";
    expect(await db.asUser(alice, visible, [league.id])).toHaveLength(0);
    expect(await db.asUser(creator, visible, [league.id])).toHaveLength(1);
    expect(await db.asUser(admin, visible, [league.id])).toHaveLength(1);

    await db.asUser(admin, "select public.set_league_hidden($1, false)", [league.id]);
    expect(await db.asUser(alice, visible, [league.id])).toHaveLength(1);
  });

  it("dismisses a single report and leaves the others open", async () => {
    const league = await customLeague();
    await report(alice, league.id);
    await report(alice, league.id, league.teams[0]);
    const { rows } = await db.pg.query<{ id: string }>(
      "select id from public.reports where league_id = $1 and team_id is null",
      [league.id],
    );
    await expect(db.asUser(alice, "select public.dismiss_report($1)", [rows[0].id])).rejects.toThrow(/admin_only/);
    await db.asUser(admin, "select public.dismiss_report($1)", [rows[0].id]);
    expect((await statuses(league.id)).sort()).toEqual(["dismissed", "open"]);
    expect(await hiddenAt(league.id)).toBeNull();
  });

  it("only lets admins resolve reports or remove logos", async () => {
    const league = await customLeague();
    for (const user of [alice, creator]) {
      await expect(db.asUser(user, "select public.resolve_league_reports($1, true)", [league.id])).rejects.toThrow(
        /admin_only/,
      );
      await expect(db.asUser(user, "select public.remove_team_logo($1)", [league.teams[0]])).rejects.toThrow(
        /admin_only/,
      );
    }
    await expect(db.asUser(null, "select public.resolve_league_reports($1, true)", [league.id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("removes a logo after the deadline, closes that team's reports and leaves others open", async () => {
    const league = await customLeague();
    const [team] = league.teams;
    const path = `${league.season_id}/logo.webp`;
    await db.pg.query("update public.teams set logo_path = $1 where id = $2", [path, team]);
    await db.pg.query("insert into storage.objects (bucket_id, name) values ('team-logos', $1)", [path]);
    await report(alice, league.id, team);
    await report(bob, league.id);
    await db.passDeadline(league.season_id);

    const [{ remove_team_logo: removed }] = await db.asUser<{ remove_team_logo: string }>(
      admin,
      "select public.remove_team_logo($1)",
      [team],
    );
    expect(removed).toBe(path);
    const { rows } = await db.pg.query<{ logo_path: string | null }>("select logo_path from public.teams where id = $1", [
      team,
    ]);
    expect(rows[0].logo_path).toBeNull();
    expect((await statuses(league.id)).sort()).toEqual(["actioned", "open"]);

    const remove = "delete from storage.objects where name = $1 returning name";
    expect(await db.asUser(creator, remove, [path])).toHaveLength(0);
    expect(await db.asUser(admin, remove, [path])).toHaveLength(1);
  });
});

describe("deleting your own account", () => {
  const deleteAccount = (user: string) => db.asUser(user, "select public.delete_own_account()");
  const exists = async (sql: string, id: string) => (await db.pg.query(sql, [id])).rows.length > 0;
  const leagueExists = (id: string) => exists("select 1 from public.leagues where id = $1", id);
  const seasonExists = (id: string) => exists("select 1 from public.seasons where id = $1", id);

  it("needs a signed-in user, and only ever removes that user", async () => {
    await expect(deleteAccount(null as unknown as string)).rejects.toThrow(/permission denied/);
    const leaver = await db.createUser("Leaver");
    const { rows: before } = await db.pg.query<{ n: number }>("select count(*)::int as n from auth.users");
    await deleteAccount(leaver);
    const { rows: after } = await db.pg.query<{ n: number }>("select count(*)::int as n from auth.users");
    expect(after[0].n).toBe(before[0].n - 1);
    expect(await exists("select 1 from public.profiles where id = $1", leaver)).toBe(false);
    expect(await exists("select 1 from public.profiles where id = $1", alice)).toBe(true);
  });

  it("removes their predictions and memberships, so they leave leaderboards", async () => {
    const leaver = await db.createUser("Leaver");
    const league = await customLeague();
    await join(leaver, league.id);
    await join(alice, league.id);
    await submit(leaver, league.season_id, league.teams);
    await submit(alice, league.season_id, league.teams);
    await db.passDeadline(league.season_id);
    await updateStandings(creator, league.season_id, league.teams);

    await deleteAccount(leaver);
    const rows = await leaderboard(alice, league.id);
    expect(rows.map((row) => row.user_id)).toEqual([alice]);
    expect(await exists("select 1 from public.predictions where user_id = $1", leaver)).toBe(false);
  });

  it("deletes their custom leagues nobody else is in", async () => {
    const leaver = await db.createUser("Leaver");
    const [{ id }] = await db.asUser<{ id: string }>(
      leaver,
      "select public.create_custom_league('Solo', 'private', null, 4, now() + interval '30 days') as id",
    );
    const { rows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [id]);
    await deleteAccount(leaver);
    expect(await leagueExists(id)).toBe(false);
    expect(await seasonExists(rows[0].season_id)).toBe(false);
  });

  it("hands a shared league to its longest-standing member, who can then run it", async () => {
    const leaver = await db.createUser("Leaver");
    const [{ id }] = await db.asUser<{ id: string }>(
      leaver,
      "select public.create_custom_league('Shared', 'public', null, 4, now() + interval '30 days') as id",
    );
    const { rows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [id]);
    await saveTeams(leaver, rows[0].season_id, ["A", "B", "C", "D"].map((name) => ({ name })));
    await db.asUser(leaver, "select public.publish_season($1)", [rows[0].season_id]);
    await join(alice, id);
    await db.pg.query("update public.memberships set joined_at = now() + interval '1 hour' where league_id = $1 and user_id = $2", [id, alice]);
    await join(bob, id);
    await db.pg.query("update public.memberships set joined_at = now() - interval '1 hour' where league_id = $1 and user_id = $2", [id, bob]);

    await deleteAccount(leaver);
    const { rows: after } = await db.pg.query<{ created_by: string }>("select created_by from public.leagues where id = $1", [id]);
    expect(after[0].created_by).toBe(bob);

    const teams = (await teamsOf(rows[0].season_id)).map((team) => team.id);
    await db.passDeadline(rows[0].season_id);
    await expect(updateStandings(bob, rows[0].season_id, teams)).resolves.toBeTruthy();
    await expect(updateStandings(alice, rows[0].season_id, teams)).rejects.toThrow(/league_not_found/);
  });

  it("removes their empty preset league but leaves the official season", async () => {
    const leaver = await db.createUser("Leaver");
    const official = await officialSeason();
    const preset = await presetLeague(official.season_id, "public", leaver);
    await deleteAccount(leaver);
    expect(await leagueExists(preset.id)).toBe(false);
    expect(await seasonExists(official.season_id)).toBe(true);
    expect(await leagueExists(official.id)).toBe(true);
  });

  it("hands over a shared preset league, and keeps a report they sent without their name", async () => {
    const leaver = await db.createUser("Leaver");
    const official = await officialSeason();
    const preset = await presetLeague(official.season_id, "public", leaver);
    await join(alice, preset.id);
    await db.asUser(leaver, "insert into public.reports (league_id, reason) values ($1, 'Rude')", [official.id]);

    await deleteAccount(leaver);
    const { rows } = await db.pg.query<{ created_by: string }>("select created_by from public.leagues where id = $1", [preset.id]);
    expect(rows[0].created_by).toBe(alice);
    const reports = await db.pg.query<{ reported_by: string | null }>("select reported_by from public.reports where league_id = $1", [official.id]);
    expect(reports.rows).toEqual([{ reported_by: null }]);
  });
});

describe("logo storage", () => {
  const upload = (user: string, name: string, bucket = "team-logos") =>
    db.asUser(user, "insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);

  beforeEach(async () => {
    await db.pg.exec("insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing");
  });

  it("creates a public bucket limited to small raster images", async () => {
    const { rows } = await db.pg.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-logos'",
    );
    expect(rows[0].public).toBe(true);
    expect(Number(rows[0].file_size_limit)).toBe(204800);
    expect(rows[0].allowed_mime_types).not.toContain("image/svg+xml");
  });

  it("lets managers upload to their own season's folder only", async () => {
    const custom = await draftCustom();
    await expect(upload(creator, `${custom.season_id}/logo.webp`)).resolves.toBeDefined();
    await expect(upload(alice, `${custom.season_id}/logo.webp`)).rejects.toThrow(/row-level security/);

    const official = await officialSeason();
    await expect(upload(admin, `${official.season_id}/logo.webp`)).resolves.toBeDefined();
    await expect(upload(creator, `${official.season_id}/logo.webp`)).rejects.toThrow(/row-level security/);
  });

  it("rejects malformed paths and other buckets", async () => {
    const { season_id } = await draftCustom();
    await expect(upload(creator, "logo.webp")).rejects.toThrow(/row-level security/);
    await expect(upload(creator, "not-a-uuid/logo.webp")).rejects.toThrow(/row-level security/);
    await expect(upload(creator, `${season_id}/logo.webp`, "other")).rejects.toThrow(/row-level security/);
  });

  it("stops uploads after the deadline", async () => {
    const league = await customLeague();
    await db.passDeadline(league.season_id);
    await expect(upload(creator, `${league.season_id}/late.webp`)).rejects.toThrow(/row-level security/);
  });
});

describe("API surface", () => {
  it("does not let API roles call internal helpers or the scoring function", async () => {
    await expect(
      db.asUser(alice, "select * from private.score_prediction('{}'::uuid[], '{}'::uuid[], 0, null, null, 0)"),
    ).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, "select private.new_join_code()")).rejects.toThrow(/permission denied/);
  });

  it("does not leave any public table without row-level security", async () => {
    const { rows } = await db.pg.query<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("runs every definer function with a locked search path", async () => {
    const { rows } = await db.pg.query<{ proname: string }>(
      `select p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and p.prosecdef
         and not coalesce(p.proconfig::text like '%search_path=%', false)`,
    );
    expect(rows).toEqual([]);
  });

  it("makes the league view respect row security", async () => {
    const { rows } = await db.pg.query<{ reloptions: string[] }>(
      "select reloptions from pg_class where oid = 'public.league_details'::regclass",
    );
    expect(rows[0].reloptions).toContain("security_invoker=true");
  });
});

describe("moving existing data to seasons", () => {
  it("keeps custom leagues working and turns host leagues into ownerless official ones", async () => {
    const old = await createDb("20261104090000");
    const owner = await old.createUser("Owner");
    const player = await old.createUser("Player");
    const hostAdmin = await old.createUser("Host Admin", { admin: true });

    const insertLeague = (user: string, type: string, name: string, sport: string | null) =>
      old.asUser<{ id: string }>(
        user,
        `insert into public.leagues (name, type, sport, team_count, deadline, promotion_count, relegation_count)
         values ($1, $2, $3, 4, '2099-01-01', 1, 1) returning id`,
        [name, type, sport],
      );

    const [{ id: customId }] = await insertLeague(owner, "private", "Sunday League", "Football");
    await old.asUser(owner, "select public.save_league_teams($1, 4, $2::jsonb)", [
      customId,
      JSON.stringify([
        { name: "Ash", logo_path: `${customId}/logo.webp` },
        { name: "Birch" },
        { name: "Cedar" },
        { name: "Dale" },
      ]),
    ]);
    await old.asUser(owner, "select public.publish_league($1)", [customId]);
    const { rows: customTeams } = await old.pg.query<{ id: string }>(
      "select id from public.teams where league_id = $1 order by name",
      [customId],
    );
    const [{ join_code }] = (
      await old.pg.query<{ join_code: string }>("select join_code from public.leagues where id = $1", [customId])
    ).rows;
    await old.asUser(player, "select public.join_league($1, $2)", [customId, join_code]);
    await old.asUser(player, "select public.submit_prediction($1, $2)", [customId, customTeams.map((t) => t.id)]);

    const [{ id: hostId }] = await insertLeague(hostAdmin, "host", "Old Cup", null);

    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    await old.pg.exec(
      readFileSync(path.resolve(__dirname, "../migrations/20261104090000_competitions_and_seasons.sql"), "utf8"),
    );

    const details = await old.pg.query<Record<string, unknown>>(
      "select name, type, created_by, season_id, team_count, promotion_count, status, sport, competition_name from public.league_details order by name",
    );
    expect(details.rows).toHaveLength(2);
    const [host, custom] = details.rows;
    expect(custom).toMatchObject({
      name: "Sunday League",
      type: "private",
      created_by: owner,
      season_id: customId,
      team_count: 4,
      promotion_count: 1,
      status: "published",
      sport: "Football",
      competition_name: null,
    });
    expect(host).toMatchObject({
      name: "Old Cup",
      type: "official",
      created_by: null,
      season_id: hostId,
      sport: "Other",
      competition_name: "Old Cup",
    });

    const prediction = await old.pg.query<{ season_id: string; team_order: string[] }>(
      "select season_id, team_order from public.predictions",
    );
    expect(prediction.rows).toEqual([{ season_id: customId, team_order: customTeams.map((t) => t.id) }]);

    const logo = await old.pg.query<{ logo_path: string }>(
      "select logo_path from public.teams where season_id = $1 and name = 'Ash'",
      [customId],
    );
    expect(logo.rows[0].logo_path).toBe(`${customId}/logo.webp`);

    const hostMembers = await old.pg.query("select 1 from public.memberships where league_id = $1", [hostId]);
    expect(hostMembers.rows).toHaveLength(0);

    // Existing players can still edit their table, and the rules still apply.
    await expect(
      old.asUser(player, "select public.submit_prediction($1, $2)", [customId, customTeams.map((t) => t.id).reverse()]),
    ).resolves.toBeDefined();
    await expect(
      old.asUser(owner, "select public.create_custom_league('Next', 'private', null, 4, '2099-01-01')"),
    ).resolves.toBeDefined();
  });
});
