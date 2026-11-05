import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

const MERGE = readFileSync(path.resolve(__dirname, "../seed/merge-conferences.sql"), "utf8");
const SEED = readFileSync(path.resolve(__dirname, "../seed/launch-leagues.sql"), "utf8");
const FUTURE = "2099-01-01T00:00:00Z";

let db: Db;
let admin: string;
let alice: string;
let bob: string;
let carol: string;
let outsider: string;

// A season split into two four-team conferences, with the first team of each listed first.
type Divided = { season: string; league: string; east: string[]; west: string[]; eastId: string; westId: string };

async function dividedSeason(competition = "Split Cup"): Promise<Divided> {
  const [{ id: league }] = await db.asUser<{ id: string }>(
    admin,
    "select public.create_official_season('Football', $1, '2030', 8, $2) as id",
    [competition, FUTURE],
  );
  const { rows: seasonRows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [league]);
  const season = seasonRows[0].season_id;
  const { rows: divisions } = await db.pg.query<{ id: string }>(
    "insert into public.divisions (season_id, name, position) values ($1, 'East', 1), ($1, 'West', 2) returning id",
    [season],
  );
  const [eastId, westId] = divisions.map((row) => row.id);
  const addTeams = async (division: string, prefix: string) => {
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const { rows } = await db.pg.query<{ id: string }>(
        "insert into public.teams (season_id, name, division_id) values ($1, $2, $3) returning id",
        [season, `${prefix} ${i}`, division],
      );
      ids.push(rows[0].id);
    }
    return ids;
  };
  const east = await addTeams(eastId, "East");
  const west = await addTeams(westId, "West");
  await db.asUser(admin, "select public.publish_season($1)", [season]);
  return { season, league, east, west, eastId, westId };
}

const submit = (user: string, season: string, order: string[]) =>
  db.asUser(user, "select public.submit_prediction($1, $2)", [season, order]);
const join = (user: string, league: string) => db.asUser(user, "select public.join_league($1, null)", [league]);
const updateStandings = (season: string, order: string[]) =>
  db.asUser(admin, "select public.update_standings($1, $2)", [season, order]);

type Score = { user_id: string; base_points: number; bonus_points: number; total_points: number; exact_count: number; rank: number };
const board = (league: string) => db.asUser<Score>(null, "select * from public.league_leaderboard($1)", [league]);

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("Admin", { admin: true });
  alice = await db.createUser("Alice");
  bob = await db.createUser("Bob");
  carol = await db.createUser("Carol");
  outsider = await db.createUser("Outsider");
});

beforeEach(async () => {
  await db.pg.exec(`
    delete from public.reports;
    delete from public.seasons;
    delete from public.competitions;
    delete from public.sports;
    delete from public.profiles where is_guest;
  `);
});

describe("conference scoring", () => {
  it("scores each conference as its own table and adds the points", async () => {
    const split = await dividedSeason();
    await join(alice, split.league);
    await join(bob, split.league);
    // Alice calls both tables exactly. Bob gets East exactly, and reverses West.
    await submit(alice, split.season, [...split.east, ...split.west]);
    await submit(bob, split.season, [...split.east, ...[...split.west].reverse()]);
    await db.passDeadline(split.season);
    await updateStandings(split.season, [...split.east, ...split.west]);

    const rows = await board(split.league);
    const score = (user: string) => rows.find((row) => row.user_id === user)!;

    // Four teams at four points in each conference, plus 10 for first place in each.
    expect(score(alice)).toMatchObject({ base_points: 32, bonus_points: 20, total_points: 52, exact_count: 8, rank: 1 });
    // East is a perfect 16 with its first-place bonus. West reversed scores 1 + 3 + 3 + 1.
    expect(score(bob)).toMatchObject({ base_points: 16 + 8, bonus_points: 10, total_points: 34, exact_count: 4, rank: 2 });
  });

  it("gives the same score whichever way round the whole order is stored", async () => {
    const split = await dividedSeason();
    await join(alice, split.league);
    await join(bob, split.league);
    await submit(alice, split.season, [...split.east, ...split.west]);
    // The same tables, with the teams interleaved in the stored order.
    const mixed = split.east.flatMap((team, index) => [team, split.west[index]]);
    await submit(bob, split.season, mixed);
    await db.passDeadline(split.season);
    await updateStandings(split.season, [...split.west, ...split.east]);

    const rows = await board(split.league);
    expect(new Set(rows.map((row) => row.total_points)).size).toBe(1);
    expect(rows[0].total_points).toBe(52);
  });

  it("applies the season's zones inside each conference", async () => {
    const split = await dividedSeason();
    // One relegated from each conference of four, so position 4 in each is the zone.
    await db.pg.query("update public.seasons set relegation_count = 1 where id = $1", [split.season]);
    await join(alice, split.league);
    await submit(alice, split.season, [...split.east, ...split.west]);
    await db.passDeadline(split.season);
    await updateStandings(split.season, [...split.east, ...split.west]);

    const [row] = await board(split.league);
    // 10 for first place and 5 for the relegation zone, in each conference.
    expect(row.bonus_points).toBe(30);
  });

  it("leaves a season with no conferences scoring exactly as before", async () => {
    const [{ id: league }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Plain Cup', '2030', 4, $1) as id",
      [FUTURE],
    );
    const { rows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [league]);
    const season = rows[0].season_id;
    await db.asUser(admin, "select public.save_season_teams($1, 4, $2::jsonb)", [
      season,
      JSON.stringify([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]),
    ]);
    await db.asUser(admin, "select public.publish_season($1)", [season]);
    const { rows: teams } = await db.pg.query<{ id: string }>("select id from public.teams where season_id = $1 order by name", [season]);
    const order = teams.map((team) => team.id);
    await join(alice, league);
    await submit(alice, season, order);
    await db.passDeadline(season);
    await updateStandings(season, order);

    expect((await board(league))[0]).toMatchObject({ base_points: 16, bonus_points: 10, exact_count: 4 });
  });
});

describe("the rules around conferences", () => {
  it("still needs every team, in one order, to submit", async () => {
    const split = await dividedSeason();
    await join(alice, split.league);
    await expect(submit(alice, split.season, split.east)).rejects.toThrow(/invalid_team_order/);
  });

  it("refuses a new team with no conference", async () => {
    const split = await dividedSeason();
    await expect(
      db.pg.query("insert into public.teams (season_id, name) values ($1, 'Stray')", [split.season]),
    ).rejects.toThrow(/team_needs_division/);
    await expect(
      db.pg.query("update public.teams set division_id = null where id = $1", [split.east[0]]),
    ).rejects.toThrow(/team_needs_division/);
  });

  it("refuses a team in another season's conference", async () => {
    const first = await dividedSeason("First Cup");
    const second = await dividedSeason("Second Cup");
    await expect(
      db.pg.query("update public.teams set division_id = $1 where id = $2", [second.eastId, first.east[0]]),
    ).rejects.toThrow(/teams_division_in_same_season/);
  });

  it("lets anyone who can see a season read its conferences, but nobody change them", async () => {
    const split = await dividedSeason();
    const visible = await db.asUser<{ name: string }>(null, "select name from public.divisions where season_id = $1 order by position", [split.season]);
    expect(visible.map((row) => row.name)).toEqual(["East", "West"]);
    await expect(
      db.asUser(alice, "insert into public.divisions (season_id, name, position) values ($1, 'North', 3)", [split.season]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, "delete from public.divisions where season_id = $1", [split.season])).rejects.toThrow(/permission denied/);
  });

  it("hides the conferences of a draft season", async () => {
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Draft Cup', '2030', 8, $1) as id",
      [FUTURE],
    );
    const { rows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [id]);
    await db.pg.query("insert into public.divisions (season_id, name, position) values ($1, 'East', 1)", [rows[0].season_id]);
    expect(await db.asUser(outsider, "select name from public.divisions where season_id = $1", [rows[0].season_id])).toEqual([]);
  });

  it("does not let API roles call the new helpers", async () => {
    await expect(db.asUser(alice, "select private.order_within_division('{}'::uuid[], gen_random_uuid())")).rejects.toThrow(/permission denied/);
  });

  it("deletes cleanly with its season", async () => {
    const split = await dividedSeason();
    await db.asUser(admin, "select public.delete_league($1)", [split.league]);
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.divisions where season_id = $1", [split.season]);
    expect(rows[0].n).toBe(0);
  });

  it("copies conferences to a new season, with each team in its own", async () => {
    const split = await dividedSeason();
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Split Cup', '2031', 8, $1, $2) as id",
      [FUTURE, split.season],
    );
    const { rows: seasonRows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [id]);
    const { rows } = await db.pg.query<{ team: string; division: string }>(
      `select t.name as team, d.name as division
       from public.teams t join public.divisions d on d.id = t.division_id
       where t.season_id = $1 order by t.name`,
      [seasonRows[0].season_id],
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.team.startsWith(row.division))).toBe(true);
  });
});

describe("conferences on the directory", () => {
  async function addEntrants(season: string, count: number, order: string[]) {
    for (let i = 0; i < count; i++) {
      const { rows } = await db.pg.query<{ id: string }>(
        "insert into public.profiles (id, display_name, is_guest) values (gen_random_uuid(), $1, true) returning id",
        [`Player ${i}`],
      );
      await db.pg.query("insert into public.predictions (season_id, user_id, team_order) values ($1, $2, $3)", [season, rows[0].id, order]);
    }
  }
  const row = async () =>
    (
      await db.asUser<{ division_names: string[] | null; crowd_team: string | null; crowd_percent: number | null; crowd_picks: unknown; team_count: number }>(
        null,
        "select division_names, crowd_team, crowd_percent, crowd_picks, team_count from public.public_directory() where competition_name = 'Split Cup'",
      )
    )[0];

  it("names the conferences, in order", async () => {
    await dividedSeason();
    expect((await row()).division_names).toEqual(["East", "West"]);
  });

  it("gives the crowd's pick for each conference from 10 entrants, never for just the first", async () => {
    const split = await dividedSeason();
    await addEntrants(split.season, 9, [...split.east, ...split.west]);
    expect(await row()).toMatchObject({ crowd_team: null, crowd_picks: null });

    await addEntrants(split.season, 1, [...split.east, ...split.west]);
    expect(await row()).toMatchObject({
      crowd_team: null,
      crowd_percent: null,
      crowd_picks: [
        { division: "East", team: "East 1", percent: 100 },
        { division: "West", team: "West 1", percent: 100 },
      ],
    });
  });

  it("finds a conference's top pick wherever it sits in the stored order, and rounds to 5%", async () => {
    const split = await dividedSeason();
    await addEntrants(split.season, 7, [...split.west, ...split.east]);
    const otherWest = [split.west[1], split.west[0], split.west[2], split.west[3]];
    await addEntrants(split.season, 4, [...split.east, ...otherWest]);
    const picks = (await row()).crowd_picks as { division: string; team: string; percent: number }[];
    expect(picks).toEqual([
      { division: "East", team: "East 1", percent: 100 },
      { division: "West", team: "West 1", percent: 65 },
    ]);
  });

  it("gives a league with no conferences nothing new", async () => {
    const [{ id }] = await db.asUser<{ id: string }>(
      admin,
      "select public.create_official_season('Football', 'Plain Cup', '2030', 4, $1) as id",
      [FUTURE],
    );
    const { rows } = await db.pg.query<{ season_id: string }>("select season_id from public.leagues where id = $1", [id]);
    await db.asUser(admin, "select public.save_season_teams($1, 4, $2::jsonb)", [
      rows[0].season_id,
      JSON.stringify([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]),
    ]);
    await db.asUser(admin, "select public.publish_season($1)", [rows[0].season_id]);
    const [plain] = await db.asUser<{ division_names: unknown; crowd_picks: unknown }>(
      null,
      "select division_names, crowd_picks from public.public_directory() where competition_name = 'Plain Cup'",
    );
    expect(plain).toEqual({ division_names: null, crowd_picks: null });
  });
});

describe("merging MLS", () => {
  // Today's real shape, built by hand because the seed now creates the merged league directly.
  type OldShape = { eastSeason: string; westSeason: string; eastLeague: string; westLeague: string; east: string[]; west: string[] };

  async function oldShape(): Promise<OldShape> {
    await db.pg.exec(`
      insert into public.sports (name) values ('Football'), ('Basketball');
      insert into public.competitions (sport_id, name, accent, sort_order, opens_note)
      select s.id, item.name, item.accent, item.sort_order, item.note
      from (values
        ('Football', 'MLS East', '#1E90FF', 100, 'Opens around mid-2027'),
        ('Football', 'MLS West', '#E5007D', 101, 'Opens around mid-2027'),
        ('Basketball', 'NBA East', '#1D4ED8', 110, 'Opens in late summer'),
        ('Basketball', 'NBA West', '#DC2626', 111, 'Opens in late summer')
      ) as item (sport, name, accent, sort_order, note)
      join public.sports s on s.name = item.sport;
    `);
    const addSide = async (competition: string, prefix: string) => {
      const { rows: seasons } = await db.pg.query<{ id: string }>(
        `insert into public.seasons (competition_id, label, team_count, deadline, playoff_from, playoff_to, playoff_label)
         select id, '2027 Sprint', 4, $2, 1, 2, 'Playoffs' from public.competitions where name = $1
         returning id`,
        [competition, FUTURE],
      );
      const season = seasons[0].id;
      const ids: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const { rows } = await db.pg.query<{ id: string }>(
          "insert into public.teams (season_id, name) values ($1, $2) returning id",
          [season, `${prefix} ${i}`],
        );
        ids.push(rows[0].id);
      }
      const { rows: leagues } = await db.pg.query<{ id: string }>(
        "insert into public.leagues (name, type, season_id, created_by) values ($1, 'official', $2, null) returning id",
        [`${competition} 2027 Sprint`, season],
      );
      await db.pg.query("update public.seasons set status = 'published' where id = $1", [season]);
      return { season, league: leagues[0].id, ids };
    };
    const east = await addSide("MLS East", "East");
    const west = await addSide("MLS West", "West");
    return { eastSeason: east.season, westSeason: west.season, eastLeague: east.league, westLeague: west.league, east: east.ids, west: west.ids };
  }

  const predictionOf = async (user: string, season: string) =>
    (
      await db.pg.query<{ team_order: string[]; needs_review: boolean }>(
        "select team_order, needs_review from public.predictions where user_id = $1 and season_id = $2",
        [user, season],
      )
    ).rows[0];

  const summaryOf = async () => {
    const { rows } = await db.pg.query<{ what: string; how_many: number }>("select what, how_many from merge_summary order by step");
    return Object.fromEntries(rows.map((row) => [row.what, row.how_many]));
  };

  it("makes one league with two conferences of the same teams", async () => {
    const old = await oldShape();
    await db.pg.exec(MERGE);

    const { rows: details } = await db.pg.query<{ id: string; name: string; slug: string; competition_name: string; season_label: string; team_count: number; competition_accent: string; status: string }>(
      "select id, name, slug, competition_name, season_label, team_count, competition_accent, status from public.league_details where type = 'official'",
    );
    expect(details).toEqual([
      {
        id: old.eastLeague,
        name: "MLS 2027 Sprint",
        slug: "mls-2027-sprint",
        competition_name: "MLS",
        season_label: "2027 Sprint",
        team_count: 8,
        competition_accent: "#1E90FF",
        status: "published",
      },
    ]);

    const { rows: teams } = await db.pg.query<{ id: string; division: string }>(
      `select t.id, d.name as division from public.teams t join public.divisions d on d.id = t.division_id where t.season_id = $1`,
      [old.eastSeason],
    );
    expect(teams.filter((team) => team.division === "East").map((team) => team.id).sort()).toEqual([...old.east].sort());
    expect(teams.filter((team) => team.division === "West").map((team) => team.id).sort()).toEqual([...old.west].sort());

    const { rows: names } = await db.pg.query<{ name: string }>("select name from public.competitions order by name");
    expect(names.map((row) => row.name)).toEqual(["MLS", "NBA"]);
    const { rows: seasons } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.seasons");
    expect(seasons[0].n).toBe(1);
  });

  it("combines a player's two tables into one prediction that still counts", async () => {
    const old = await oldShape();
    await join(alice, old.eastLeague);
    await join(alice, old.westLeague);
    const eastTable = [...old.east].reverse();
    await submit(alice, old.eastSeason, eastTable);
    await submit(alice, old.westSeason, old.west);

    await db.pg.exec(MERGE);

    expect(await predictionOf(alice, old.eastSeason)).toEqual({ team_order: [...eastTable, ...old.west], needs_review: false });
    expect(await predictionOf(alice, old.westSeason)).toBeUndefined();
    expect(await summaryOf()).toMatchObject({ "Players who entered both, now one prediction": 1 });

    await db.passDeadline(old.eastSeason);
    await updateStandings(old.eastSeason, [...eastTable, ...old.west]);
    expect((await board(old.eastLeague))[0]).toMatchObject({ user_id: alice, base_points: 32, exact_count: 8 });
  });

  it("keeps a table for someone who entered one conference, and asks them to review", async () => {
    const old = await oldShape();
    await join(alice, old.eastLeague);
    await join(bob, old.westLeague);
    const eastTable = [...old.east].reverse();
    const westTable = [...old.west].reverse();
    await submit(alice, old.eastSeason, eastTable);
    await submit(bob, old.westSeason, westTable);

    await db.pg.exec(MERGE);

    expect(await predictionOf(alice, old.eastSeason)).toEqual({ team_order: [...eastTable, ...old.west], needs_review: true });
    expect(await predictionOf(bob, old.eastSeason)).toEqual({ team_order: [...old.east, ...westTable], needs_review: true });
    expect(await summaryOf()).toMatchObject({
      "Players who entered East only, asked to review": 1,
      "Players who entered West only, asked to review": 1,
    });

    // Submitting clears the review, and they count from then on.
    await submit(bob, old.eastSeason, [...old.east, ...westTable]);
    expect((await predictionOf(bob, old.eastSeason)).needs_review).toBe(false);
  });

  it("does not score a table still waiting for review", async () => {
    const old = await oldShape();
    await join(alice, old.eastLeague);
    await submit(alice, old.eastSeason, old.east);
    await db.pg.exec(MERGE);
    await db.passDeadline(old.eastSeason);
    await updateStandings(old.eastSeason, [...old.east, ...old.west]);
    expect(await board(old.eastLeague)).toEqual([]);
  });

  it("keeps everyone's memberships, without doubling up", async () => {
    const old = await oldShape();
    await join(alice, old.eastLeague);
    await join(alice, old.westLeague);
    await join(bob, old.westLeague);
    await db.pg.exec(MERGE);
    const { rows } = await db.pg.query<{ user_id: string }>("select user_id from public.memberships where league_id = $1", [old.eastLeague]);
    expect(rows.map((row) => row.user_id).sort()).toEqual([alice, bob].sort());
    expect(await summaryOf()).toMatchObject({ "Members moved from the MLS West league": 1 });
  });

  it("moves groups playing West across, keeping their members and code", async () => {
    const old = await oldShape();
    const [{ id: group }] = await db.asUser<{ id: string }>(
      carol,
      "select public.create_preset_league($1, 'West Coast Friends', 'private') as id",
      [old.westSeason],
    );
    const { rows: before } = await db.pg.query<{ join_code: string; slug: string }>("select join_code, slug from public.leagues where id = $1", [group]);
    await join(bob, old.eastLeague);
    await db.pg.exec(MERGE);

    const { rows } = await db.pg.query<{ season_id: string; name: string; join_code: string; slug: string }>(
      "select season_id, name, join_code, slug from public.leagues where id = $1",
      [group],
    );
    expect(rows[0]).toEqual({ season_id: old.eastSeason, name: "West Coast Friends", join_code: before[0].join_code, slug: before[0].slug });
    const members = await db.pg.query<{ user_id: string }>("select user_id from public.memberships where league_id = $1", [group]);
    expect(members.rows.map((row) => row.user_id)).toEqual([carol]);
    expect(await summaryOf()).toMatchObject({ "Groups moved from MLS West": 1 });
  });

  it("moves reports, dropping one that would be a duplicate", async () => {
    const old = await oldShape();
    for (const league of [old.eastLeague, old.westLeague]) {
      await db.pg.query("insert into public.reports (league_id, reported_by, reason) values ($1, $2, 'Spam')", [league, alice]);
    }
    await db.pg.query("insert into public.reports (league_id, reported_by, reason) values ($1, $2, 'Other')", [old.westLeague, bob]);

    await db.pg.exec(MERGE);

    const { rows } = await db.pg.query<{ reported_by: string; league_id: string }>("select reported_by, league_id from public.reports");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.league_id === old.eastLeague)).toBe(true);
  });

  it("stops without changing anything if it's run again", async () => {
    const old = await oldShape();
    await db.pg.exec(MERGE);
    await expect(db.pg.exec(MERGE)).rejects.toThrow(/Has this already been run/);
    await db.pg.exec("rollback");
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.teams where season_id = $1", [old.eastSeason]);
    expect(rows[0].n).toBe(8);
  });

  it("stops without changing anything if MLS has locked", async () => {
    const old = await oldShape();
    await db.passDeadline(old.westSeason);
    await expect(db.pg.exec(MERGE)).rejects.toThrow(/already locked/);
    await db.pg.exec("rollback");
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.seasons");
    expect(rows[0].n).toBe(2);
  });

  it("stops without changing anything if the two lock at different times", async () => {
    const old = await oldShape();
    await db.pg.query("update public.seasons set deadline = '2098-01-01' where id = $1", [old.westSeason]);
    await expect(db.pg.exec(MERGE)).rejects.toThrow(/different times/);
    await db.pg.exec("rollback");
    const { rows } = await db.pg.query<{ n: number }>("select count(*)::int as n from public.competitions where name in ('MLS East', 'MLS West')");
    expect(rows[0].n).toBe(2);
  });

  it("refuses to run on a database the new seed created", async () => {
    const fresh = await createDb();
    await fresh.pg.exec(SEED);
    await expect(fresh.pg.exec(MERGE)).rejects.toThrow(/Has this already been run/);
  });
});
