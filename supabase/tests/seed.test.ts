import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

const SEED = readFileSync(path.resolve(__dirname, "../seed/launch-leagues.sql"), "utf8");
const PRIVATE_FILE = path.resolve(__dirname, "../private/day-ones.sql");

type SeasonRow = {
  competition: string;
  label: string;
  team_count: number;
  status: string;
  deadline: string;
  promotion_count: number;
  playoff_from: number | null;
  playoff_to: number | null;
  relegation_count: number;
  promotion_label: string;
  playoff_label: string;
  relegation_label: string;
  season_id: string;
  league_id: string;
};

const seasonsOf = async (db: Db) =>
  (
    await db.pg.query<SeasonRow>(
      `select c.name as competition, s.label, s.team_count, s.status, s.deadline, s.promotion_count,
         s.playoff_from, s.playoff_to, s.relegation_count, s.promotion_label, s.playoff_label,
         s.relegation_label, s.id as season_id, l.id as league_id
       from public.seasons s
       join public.competitions c on c.id = s.competition_id
       join public.leagues l on l.season_id = s.id and l.type = 'official'`,
    )
  ).rows;

describe("launch leagues", () => {
  let db: Db;
  let seasons: SeasonRow[];
  const season = (competition: string) => seasons.find((row) => row.competition === competition)!;

  beforeAll(async () => {
    db = await createDb();
    await db.pg.exec(SEED);
    seasons = await seasonsOf(db);
  });

  it("creates each season with the right number of teams", async () => {
    expect(Object.fromEntries(seasons.map((row) => [row.competition, row.team_count]))).toEqual({
      "Premier League": 20,
      MLS: 30,
      NRL: 18,
      IPL: 10,
      AFL: 18,
    });
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.teams");
    expect(rows[0].n).toBe(96);
  });

  it("publishes every season, each with one global league and no owner", async () => {
    expect(seasons.every((row) => row.status === "published")).toBe(true);
    const { rows } = await db.pg.query<{ n: number }>(
      "select count(*)::int as n from public.leagues where type = 'official' and created_by is null",
    );
    expect(rows[0].n).toBe(5);
  });

  it("splits MLS into East and West, with 15 teams each and nobody left out", async () => {
    const { rows } = await db.pg.query<{ name: string; position: number; teams: number }>(
      `select d.name, d.position, count(t.id)::int as teams
       from public.divisions d
       left join public.teams t on t.division_id = d.id
       where d.season_id = $1
       group by d.name, d.position
       order by d.position`,
      [season("MLS").season_id],
    );
    expect(rows).toEqual([
      { name: "East", position: 1, teams: 15 },
      { name: "West", position: 2, teams: 15 },
    ]);
    const other = await db.pg.query<{ n: number }>("select count(*)::int as n from public.divisions where season_id <> $1", [
      season("MLS").season_id,
    ]);
    expect(other.rows[0].n).toBe(0);
  });

  it("gives every team a unique name and short code in its league, with colours and no logo", async () => {
    const { rows } = await db.pg.query<{
      season_id: string;
      name: string;
      short_name: string;
      logo_path: string | null;
      colour_primary: string;
      colour_secondary: string;
    }>("select season_id, name, short_name, logo_path, colour_primary, colour_secondary from public.teams");
    for (const { season_id: id } of seasons) {
      const inSeason = rows.filter((row) => row.season_id === id);
      expect(new Set(inSeason.map((row) => row.name.toLowerCase())).size).toBe(inSeason.length);
      expect(new Set(inSeason.map((row) => row.short_name)).size).toBe(inSeason.length);
    }
    expect(rows.every((row) => row.logo_path === null)).toBe(true);
    expect(rows.every((row) => /^[A-Z0-9]{2,4}$/.test(row.short_name))).toBe(true);
    expect(rows.every((row) => row.colour_primary !== row.colour_secondary)).toBe(true);
  });

  it("locks the Premier League at its first game", () => {
    expect(new Date(season("Premier League").deadline).toISOString()).toBe("2026-08-21T19:00:00.000Z");
  });

  it("sets the zones and their wording", () => {
    expect(season("Premier League")).toMatchObject({
      promotion_count: 4,
      playoff_from: null,
      relegation_count: 3,
      promotion_label: "Champions League",
      relegation_label: "Relegated",
    });
    expect(season("AFL")).toMatchObject({ playoff_from: 1, playoff_to: 10, playoff_label: "Finals", promotion_count: 0 });
    expect(season("NRL")).toMatchObject({ playoff_from: 1, playoff_to: 8, playoff_label: "Finals" });
    expect(season("IPL")).toMatchObject({ playoff_from: 1, playoff_to: 4, playoff_label: "Playoffs" });
    expect(season("MLS")).toMatchObject({ playoff_from: 1, playoff_to: 8, playoff_label: "Playoffs" });
  });

  it("lists the coming-soon competitions, with NBA as one league", async () => {
    const { rows } = await db.pg.query<{ name: string }>(
      "select name from public.competitions where opens_note is not null order by name",
    );
    expect(rows.map((row) => row.name)).toEqual([
      "Bundesliga",
      "EFL Championship",
      "Eredivisie",
      "EuroLeague",
      "La Liga",
      "Ligue 1",
      "MLS",
      "NBA",
      "Premier League",
      "Primeira Liga",
      "Saudi Pro League",
      "Serie A",
    ]);
  });

  it("shows the live Premier League and its next season on the directory", async () => {
    const rows = await db.asUser<{ competition_name: string; state: string }>(
      null,
      "select competition_name, state from public.public_directory() where competition_name = 'Premier League'",
    );
    expect(rows.map((row) => row.state).sort()).toEqual(["coming_soon", "live"]);
  });

  it("gives every competition an accent colour", async () => {
    const { rows } = await db.pg.query<{ n: number }>(
      "select count(*)::int as n from public.competitions where accent is null",
    );
    expect(rows[0].n).toBe(0);
  });

  it("changes nothing if it's run twice", async () => {
    const before = await db.pg.query<{ n: number }>("select count(*)::int as n from public.seasons");
    await expect(db.pg.exec(SEED)).rejects.toThrow(/already exists/);
    await db.pg.exec("rollback");
    const after = await db.pg.query<{ n: number }>("select count(*)::int as n from public.seasons");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("reuses a competition left behind by deleted test leagues", async () => {
    const fresh = await createDb();
    const { rows } = await fresh.pg.query<{ id: string }>("insert into public.sports (name) values ('football') returning id");
    await fresh.pg.query("insert into public.competitions (sport_id, name) values ($1, 'premier league')", [rows[0].id]);

    await fresh.pg.exec(SEED);

    const sports = await fresh.pg.query<{ n: number }>(
      "select count(*)::int as n from public.sports where lower(name) = 'football'",
    );
    expect(sports.rows[0].n).toBe(1);
    const competitions = await fresh.pg.query<{ accent: string }>(
      "select accent from public.competitions where lower(name) = 'premier league'",
    );
    expect(competitions.rows).toEqual([{ accent: "#7A2BF0" }]);
    const spelling = await fresh.pg.query<{ name: string }>(
      "select c.name from public.competitions c join public.sports s on s.id = c.sport_id where s.name = 'Football' and lower(c.name) = 'premier league'",
    );
    expect(spelling.rows).toEqual([{ name: "Premier League" }]);
  });

  it("isn't confused by a competition with the same name under another sport", async () => {
    const fresh = await createDb();
    const { rows } = await fresh.pg.query<{ id: string }>("insert into public.sports (name) values ('Soccer') returning id");
    await fresh.pg.query("insert into public.competitions (sport_id, name) values ($1, 'Premier League')", [rows[0].id]);

    await fresh.pg.exec(SEED);

    const seasons = await fresh.pg.query<{ sport: string }>(
      "select sport from public.league_details where type = 'official' and competition_name = 'Premier League'",
    );
    expect(seasons.rows).toEqual([{ sport: "Football" }]);
  });
});

// Only runs on a machine holding the git-ignored file, so the friends' data never reaches the repo.
describe.runIf(existsSync(PRIVATE_FILE))("the private Day ones file", () => {
  let db: Db;
  let admin: string;
  let premier: SeasonRow;
  let group: string;

  beforeAll(async () => {
    db = await createDb();
    admin = await db.createUser("Owner", { admin: true });
    await db.pg.exec(SEED);
    await db.pg.exec(readFileSync(PRIVATE_FILE, "utf8"));
    premier = (await seasonsOf(db)).find((row) => row.competition === "Premier League")!;
    const { rows } = await db.pg.query<{ id: string }>("select id from public.leagues where name = 'Day ones'");
    group = rows[0].id;
  });

  it("adds 17 guests under unique short names", async () => {
    const { rows } = await db.pg.query<{ display_name: string }>(
      "select display_name from public.profiles where is_guest",
    );
    expect(rows).toHaveLength(17);
    expect(new Set(rows.map((row) => row.display_name)).size).toBe(17);
    expect(rows.every((row) => /^[A-Z][a-z]+ [A-Z]\.$/.test(row.display_name))).toBe(true);
  });

  it("gives them complete tables, submitted before the first game", async () => {
    const { rows } = await db.pg.query<{ complete: boolean; early: boolean; needs_review: boolean }>(
      `select private.is_complete_order(season_id, team_order) as complete,
         submitted_at < $2::timestamptz as early, needs_review
       from public.predictions where season_id = $1`,
      [premier.season_id, premier.deadline],
    );
    expect(rows).toHaveLength(17);
    expect(rows.every((row) => row.complete && row.early && !row.needs_review)).toBe(true);
  });

  it("puts all 17 in both the global league and a public Day ones group you follow", async () => {
    const counts = await db.pg.query<{ league_id: string; n: number }>(
      "select league_id, count(*)::int as n from public.memberships where role = 'player' group by league_id",
    );
    expect(counts.rows.find((row) => row.league_id === premier.league_id)?.n).toBe(17);
    expect(counts.rows.find((row) => row.league_id === group)?.n).toBe(17);

    const details = await db.pg.query<{ type: string; created_by: string }>(
      "select type, created_by from public.leagues where id = $1",
      [group],
    );
    expect(details.rows[0]).toEqual({ type: "public", created_by: admin });
    const owner = await db.pg.query<{ role: string }>(
      "select role from public.memberships where league_id = $1 and user_id = $2",
      [group, admin],
    );
    expect(owner.rows[0].role).toBe("spectator");
  });

  it("scores them on both leaderboards once you save a table", async () => {
    const { rows: teams } = await db.pg.query<{ id: string }>(
      "select id from public.teams where season_id = $1 order by name",
      [premier.season_id],
    );
    await db.asUser(admin, "select public.update_standings($1, $2)", [premier.season_id, teams.map((team) => team.id)]);

    for (const league of [premier.league_id, group]) {
      const board = await db.asUser<{ rank: number; total_points: number; entry_count: number }>(
        null,
        "select rank, total_points, entry_count from public.league_leaderboard($1)",
        [league],
      );
      expect(board).toHaveLength(17);
      expect(board.every((row) => row.rank !== null && row.total_points > 0 && row.entry_count === 17)).toBe(true);
    }
  });

  it("shows a rounded crowd pick and the player count on the directory", async () => {
    const rows = await db.asUser<{ entrant_count: number; crowd_team: string; crowd_percent: number; leader_name: string }>(
      null,
      "select entrant_count, crowd_team, crowd_percent, leader_name from public.public_directory() where season_id = $1",
      [premier.season_id],
    );
    expect(rows[0]).toMatchObject({ entrant_count: 17, crowd_team: "Arsenal", crowd_percent: 40 });
    expect(rows[0].leader_name).toEqual(expect.any(String));
  });

  it("keeps their picks behind sign-in", async () => {
    await expect(
      db.asUser(null, "select team_order from public.predictions where season_id = $1", [premier.season_id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("stops if it's run again", async () => {
    await expect(db.pg.exec(readFileSync(PRIVATE_FILE, "utf8"))).rejects.toThrow(/already been run/);
    await db.pg.exec("rollback");
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.profiles where is_guest");
    expect(rows[0].n).toBe(17);
  });
});
