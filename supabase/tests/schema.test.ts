import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

const FUTURE = "2099-01-01T00:00:00Z";

let db: Db;
let admin: string;
let creator: string;
let alice: string;
let bob: string;
let outsider: string;

type LeagueRow = { id: string; join_code: string; slug: string };

async function createLeague(
  type: "public" | "private" | "host" = "public",
  { teams = 4, by = creator }: { teams?: number; by?: string } = {},
) {
  const [{ id }] = await db.asUser<{ id: string }>(
    by,
    `insert into public.leagues (name, type, team_count, deadline)
     values ('Test League', $1, $2, $3) returning id`,
    [type, teams, FUTURE],
  );
  return id;
}

async function addTeams(leagueId: string, count: number, by = creator) {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const [{ id }] = await db.asUser<{ id: string }>(
      by,
      "insert into public.teams (league_id, name) values ($1, $2) returning id",
      [leagueId, `Team ${String(i).padStart(2, "0")}`],
    );
    ids.push(id);
  }
  return ids;
}

async function publishedLeague(type: "public" | "private" = "public", teamCount = 4) {
  const id = await createLeague(type, { teams: teamCount });
  const teams = await addTeams(id, teamCount);
  await db.asUser(creator, "select public.publish_league($1)", [id]);
  const [{ join_code }] = await db.asUser<LeagueRow>(
    creator,
    "select join_code from public.leagues where id = $1",
    [id],
  );
  return { id, teams, joinCode: join_code };
}

const submit = (user: string, leagueId: string, order: string[]) =>
  db.asUser(user, "select public.submit_prediction($1, $2)", [leagueId, order]);
const join = (user: string, leagueId: string, code?: string) =>
  db.asUser<{ join_league: string }>(user, "select public.join_league($1, $2)", [
    leagueId,
    code ?? null,
  ]);
const updateStandings = (user: string, leagueId: string, order: string[]) =>
  db.asUser(user, "select public.update_standings($1, $2)", [leagueId, order]);

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
  await db.pg.exec("delete from public.leagues");
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

  it("does not let users make themselves admin", async () => {
    await expect(
      db.asUser(alice, "update public.profiles set is_admin = true where id = $1", [alice]),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not expose who is an admin", async () => {
    await expect(db.asUser(alice, "select is_admin from public.profiles")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("does not expose profiles to signed-out visitors", async () => {
    await expect(db.asUser(null, "select display_name from public.profiles")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("creating leagues", () => {
  it("generates a slug and an unambiguous eight-character join code", async () => {
    const id = await createLeague();
    const [league] = await db.asUser<LeagueRow>(creator, "select * from public.leagues where id = $1", [
      id,
    ]);
    expect(league.join_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(league.slug).toMatch(/^test-league-[0-9a-f]{6}$/);
  });

  it("adds the creator as a player", async () => {
    const id = await createLeague();
    const rows = await db.asUser<{ role: string }>(
      creator,
      "select role from public.memberships where league_id = $1 and user_id = $2",
      [id, creator],
    );
    expect(rows).toEqual([{ role: "player" }]);
  });

  it("restricts host leagues to admins", async () => {
    await expect(createLeague("host")).rejects.toThrow(/only_admins/);
    await expect(createLeague("host", { by: admin })).resolves.toBeTruthy();
  });

  it("does not let a creator turn their league into a host league", async () => {
    const id = await createLeague();
    await expect(
      db.asUser(creator, "update public.leagues set type = 'host' where id = $1", [id]),
    ).rejects.toThrow(/only_admins/);
  });

  it("limits users to five leagues a day, but not admins", async () => {
    for (let i = 0; i < 5; i++) await createLeague();
    await expect(createLeague()).rejects.toThrow(/league_limit_reached/);
    for (let i = 0; i < 6; i++) await createLeague("public", { by: admin });
  });

  it("rejects deadlines in the past", async () => {
    await expect(
      db.asUser(
        creator,
        "insert into public.leagues (name, type, team_count, deadline) values ('X', 'public', 4, now() - interval '1 minute')",
      ),
    ).rejects.toThrow(/deadline_must_be_in_the_future/);
  });

  it.each([
    ["too few teams", "insert into public.leagues (name, type, team_count, deadline) values ('X', 'public', 3, '2099-01-01')"],
    ["too many teams", "insert into public.leagues (name, type, team_count, deadline) values ('X', 'public', 41, '2099-01-01')"],
    ["zones that overlap", "insert into public.leagues (name, type, team_count, deadline, promotion_count, relegation_count) values ('X', 'public', 4, '2099-01-01', 3, 2)"],
    ["playoffs inside promotion", "insert into public.leagues (name, type, team_count, deadline, promotion_count, playoff_from, playoff_to) values ('X', 'public', 10, '2099-01-01', 3, 3, 5)"],
    ["playoffs inside relegation", "insert into public.leagues (name, type, team_count, deadline, relegation_count, playoff_from, playoff_to) values ('X', 'public', 10, '2099-01-01', 3, 5, 8)"],
    ["half a playoff range", "insert into public.leagues (name, type, team_count, deadline, playoff_from) values ('X', 'public', 10, '2099-01-01', 3)"],
  ])("rejects %s", async (_name, sql) => {
    await expect(db.asUser(creator, sql)).rejects.toThrow(/violates check constraint/);
  });

  it("does not let users choose protected columns", async () => {
    for (const sql of [
      "insert into public.leagues (name, type, team_count, deadline, status) values ('X', 'public', 4, '2099-01-01', 'finished')",
      `insert into public.leagues (name, type, team_count, deadline, created_by) values ('X', 'public', 4, '2099-01-01', '${alice}')`,
      "insert into public.leagues (name, type, team_count, deadline, join_code) values ('X', 'public', 4, '2099-01-01', 'CHOSEN')",
    ]) {
      await expect(db.asUser(creator, sql)).rejects.toThrow(/permission denied/);
    }
  });

  it("does not let creators change status or hide flags directly", async () => {
    const id = await createLeague();
    await expect(
      db.asUser(creator, "update public.leagues set status = 'published' where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(creator, "update public.leagues set hidden_at = null where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("only publishes when the team count matches", async () => {
    const id = await createLeague("public", { teams: 4 });
    await addTeams(id, 3);
    await expect(db.asUser(creator, "select public.publish_league($1)", [id])).rejects.toThrow(
      /team_count_must_match_teams/,
    );
    await db.asUser(creator, "insert into public.teams (league_id, name) values ($1, 'Last Team')", [id]);
    await expect(db.asUser(creator, "select public.publish_league($1)", [id])).resolves.toBeTruthy();
  });

  it("does not let other users publish, edit or delete a league", async () => {
    const id = await createLeague();
    await expect(db.asUser(alice, "select public.publish_league($1)", [id])).rejects.toThrow(
      /league_not_found/,
    );
    await db.asUser(alice, "update public.leagues set name = 'Hacked' where id = $1", [id]);
    await db.asUser(alice, "delete from public.leagues where id = $1", [id]);
    const { rows } = await db.pg.query<{ name: string }>(
      "select name from public.leagues where id = $1",
      [id],
    );
    expect(rows[0].name).toBe("Test League");
  });
});

describe("league visibility", () => {
  it("hides drafts from everyone but the creator and admins", async () => {
    const id = await createLeague();
    const sql = "select id from public.leagues where id = $1";
    expect(await db.asUser(creator, sql, [id])).toHaveLength(1);
    expect(await db.asUser(admin, sql, [id])).toHaveLength(1);
    expect(await db.asUser(alice, sql, [id])).toHaveLength(0);
    expect(await db.asUser(null, sql, [id])).toHaveLength(0);
  });

  it("shows public leagues to everyone, including signed-out visitors", async () => {
    const { id } = await publishedLeague();
    const sql = "select id from public.leagues where id = $1";
    expect(await db.asUser(alice, sql, [id])).toHaveLength(1);
    expect(await db.asUser(null, sql, [id])).toHaveLength(1);
    expect(await db.asUser(null, "select id from public.teams where league_id = $1", [id])).toHaveLength(4);
  });

  it("hides private leagues and their teams from non-members", async () => {
    const { id } = await publishedLeague("private");
    expect(await db.asUser(alice, "select id from public.leagues where id = $1", [id])).toHaveLength(0);
    expect(await db.asUser(null, "select id from public.leagues where id = $1", [id])).toHaveLength(0);
    expect(await db.asUser(alice, "select id from public.teams where league_id = $1", [id])).toHaveLength(0);
  });

  it("shows a preview for a valid code only, in any case and to signed-out visitors", async () => {
    const { id, joinCode } = await publishedLeague("private");
    const sql = "select * from public.get_league_preview($1)";
    const rows = await db.asUser<Record<string, unknown>>(null, sql, [` ${joinCode.toLowerCase()} `]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, name: "Test League", creator_name: "Creator" });
    expect(rows[0]).not.toHaveProperty("join_code");
    expect(await db.asUser(null, sql, ["WRONGCOD"])).toHaveLength(0);
  });

  it("does not preview drafts", async () => {
    const id = await createLeague("private");
    const { rows } = await db.pg.query<{ join_code: string }>(
      "select join_code from public.leagues where id = $1",
      [id],
    );
    expect(
      await db.asUser(null, "select * from public.get_league_preview($1)", [rows[0].join_code]),
    ).toHaveLength(0);
  });

  it("removes hidden leagues for everyone but admins and the creator", async () => {
    const { id, joinCode } = await publishedLeague();
    await join(alice, id);
    await db.asUser(admin, "select public.set_league_hidden($1, true)", [id]);
    const sql = "select id from public.leagues where id = $1";
    expect(await db.asUser(alice, sql, [id])).toHaveLength(0);
    expect(await db.asUser(null, sql, [id])).toHaveLength(0);
    expect(await db.asUser(admin, sql, [id])).toHaveLength(1);
    expect(await db.asUser(null, "select * from public.get_league_preview($1)", [joinCode])).toHaveLength(0);

    await db.asUser(admin, "select public.set_league_hidden($1, false)", [id]);
    expect(await db.asUser(alice, sql, [id])).toHaveLength(1);
  });

  it("only lets admins hide leagues", async () => {
    const { id } = await publishedLeague();
    await expect(db.asUser(creator, "select public.set_league_hidden($1, true)", [id])).rejects.toThrow(
      /admin_only/,
    );
  });
});

describe("joining", () => {
  it("lets anyone join a public league as a player", async () => {
    const { id } = await publishedLeague();
    expect((await join(alice, id))[0].join_league).toBe("player");
  });

  it("requires a signed-in user", async () => {
    const { id } = await publishedLeague();
    await expect(db.asUser(null, "select public.join_league($1)", [id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("does not allow memberships to be written directly", async () => {
    const { id } = await publishedLeague("private");
    await expect(
      db.asUser(
        alice,
        "insert into public.memberships (league_id, user_id, role) values ($1, $2, 'player')",
        [id, alice],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("requires the right code for a private league", async () => {
    const { id, joinCode } = await publishedLeague("private");
    await expect(join(alice, id)).rejects.toThrow(/league_not_found/);
    await expect(join(alice, id, "WRONGCOD")).rejects.toThrow(/league_not_found/);
    expect((await join(alice, id, joinCode))[0].join_league).toBe("player");
    expect(await db.asUser(alice, "select id from public.leagues where id = $1", [id])).toHaveLength(1);
  });

  it("stops an old code working after rotation, for new joiners only", async () => {
    const { id, joinCode } = await publishedLeague("private");
    await join(alice, id, joinCode);
    await db.asUser(creator, "select public.rotate_join_code($1)", [id]);
    await expect(join(bob, id, joinCode)).rejects.toThrow(/league_not_found/);
    await expect(join(alice, id)).resolves.toBeTruthy();
  });

  it("only lets the creator rotate the code", async () => {
    const { id } = await publishedLeague();
    await expect(db.asUser(alice, "select public.rotate_join_code($1)", [id])).rejects.toThrow(
      /league_not_found/,
    );
  });

  it("makes late joiners spectators", async () => {
    const { id } = await publishedLeague();
    await db.passDeadline(id);
    expect((await join(alice, id))[0].join_league).toBe("spectator");
  });

  it("still requires the code to spectate a private league", async () => {
    const { id, joinCode } = await publishedLeague("private");
    await db.passDeadline(id);
    await expect(join(alice, id)).rejects.toThrow(/league_not_found/);
    expect((await join(alice, id, joinCode))[0].join_league).toBe("spectator");
  });

  it("keeps an existing role when joining twice", async () => {
    const { id } = await publishedLeague();
    await join(alice, id);
    await db.passDeadline(id);
    expect((await join(alice, id))[0].join_league).toBe("player");
  });

  it("cannot join a draft", async () => {
    const id = await createLeague();
    await expect(join(alice, id)).rejects.toThrow(/league_not_found/);
  });
});

describe("predictions", () => {
  it("saves a prediction and lets the player replace it before the deadline", async () => {
    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await submit(alice, id, teams);
    await submit(alice, id, [...teams].reverse());
    const rows = await db.asUser<{ team_order: string[] }>(
      alice,
      "select team_order from public.predictions where league_id = $1 and user_id = $2",
      [id, alice],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].team_order).toEqual([...teams].reverse());
  });

  it("rejects submissions after the deadline", async () => {
    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await submit(alice, id, teams);
    await db.passDeadline(id);
    await expect(submit(alice, id, [...teams].reverse())).rejects.toThrow(/deadline_passed/);
  });

  it("does not allow predictions to be written directly", async () => {
    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await expect(
      db.asUser(alice, "insert into public.predictions (league_id, user_id, team_order) values ($1, $2, $3)", [
        id,
        alice,
        teams,
      ]),
    ).rejects.toThrow(/permission denied/);
    await submit(alice, id, teams);
    await expect(
      db.asUser(alice, "update public.predictions set submitted_at = now() where league_id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects orders without each team exactly once", async () => {
    const { id, teams } = await publishedLeague();
    const other = await publishedLeague();
    await join(alice, id);
    const cases = [
      teams.slice(0, 3),
      [...teams, teams[0]],
      [teams[0], teams[0], teams[1], teams[2]],
      [teams[0], teams[1], teams[2], other.teams[0]],
      [],
    ];
    for (const order of cases) {
      await expect(submit(alice, id, order)).rejects.toThrow(/invalid_team_order/);
    }
    await expect(
      db.asUser(alice, "select public.submit_prediction($1, array[$2::uuid, $3::uuid, $4::uuid, null])", [
        id,
        teams[0],
        teams[1],
        teams[2],
      ]),
    ).rejects.toThrow(/invalid_team_order/);
  });

  it("requires membership", async () => {
    const { id, teams } = await publishedLeague();
    await expect(submit(alice, id, teams)).rejects.toThrow(/not_a_player/);
  });

  it("rejects submissions to drafts and hidden leagues", async () => {
    const draft = await createLeague();
    const draftTeams = await addTeams(draft, 4);
    await expect(submit(creator, draft, draftTeams)).rejects.toThrow(/league_not_open/);

    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await db.asUser(admin, "select public.set_league_hidden($1, true)", [id]);
    await expect(submit(alice, id, teams)).rejects.toThrow(/league_not_found/);
  });

  it("hides other players' picks until the deadline, then reveals them", async () => {
    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await join(bob, id);
    await submit(alice, id, teams);
    await submit(bob, id, teams);
    const sql = "select user_id from public.predictions where league_id = $1";

    expect(await db.asUser(alice, sql, [id])).toEqual([{ user_id: alice }]);
    expect(await db.asUser(outsider, sql, [id])).toHaveLength(0);
    expect(await db.asUser(creator, sql, [id])).toHaveLength(0);

    await db.passDeadline(id);

    expect(await db.asUser(alice, sql, [id])).toHaveLength(2);
    expect(await db.asUser(outsider, sql, [id])).toHaveLength(2);
  });

  it("does not reveal picks to signed-out visitors", async () => {
    const { id } = await publishedLeague();
    await db.passDeadline(id);
    await expect(
      db.asUser(null, "select user_id from public.predictions where league_id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps private league picks from outsiders after the deadline", async () => {
    const { id, teams, joinCode } = await publishedLeague("private");
    await join(alice, id, joinCode);
    await submit(alice, id, teams);
    await db.passDeadline(id);
    const sql = "select user_id from public.predictions where league_id = $1";
    expect(await db.asUser(outsider, sql, [id])).toHaveLength(0);
    await join(bob, id, joinCode);
    expect(await db.asUser(bob, sql, [id])).toHaveLength(1);
  });

  it("does not let spectators submit", async () => {
    const { id, teams } = await publishedLeague();
    await db.passDeadline(id);
    await join(alice, id);
    await expect(submit(alice, id, teams)).rejects.toThrow(/deadline_passed/);
  });
});

describe("changing a league after publishing", () => {
  it("flags predictions for review and updates the count when teams are added or removed", async () => {
    const { id, teams } = await publishedLeague("public", 5);
    await join(alice, id);
    await submit(alice, id, teams);
    await db.asUser(creator, "delete from public.teams where id = $1", [teams[4]]);

    const prediction = await db.asUser<{ needs_review: boolean }>(
      alice,
      "select needs_review from public.predictions where league_id = $1",
      [id],
    );
    expect(prediction[0].needs_review).toBe(true);
    const league = await db.asUser<{ team_count: number }>(
      alice,
      "select team_count from public.leagues where id = $1",
      [id],
    );
    expect(league[0].team_count).toBe(4);

    await expect(submit(alice, id, teams)).rejects.toThrow(/invalid_team_order/);
    await submit(alice, id, teams.slice(0, 4));
    const fixed = await db.asUser<{ needs_review: boolean }>(
      alice,
      "select needs_review from public.predictions where league_id = $1",
      [id],
    );
    expect(fixed[0].needs_review).toBe(false);
  });

  it("does not flag predictions when a team is renamed", async () => {
    const { id, teams } = await publishedLeague();
    await join(alice, id);
    await submit(alice, id, teams);
    await db.asUser(creator, "update public.teams set name = 'Renamed' where id = $1", [teams[0]]);
    const rows = await db.asUser<{ needs_review: boolean }>(
      alice,
      "select needs_review from public.predictions where league_id = $1",
      [id],
    );
    expect(rows[0].needs_review).toBe(false);
  });

  it("does not let a published league drop below the minimum", async () => {
    const { teams } = await publishedLeague("public", 4);
    await expect(
      db.asUser(creator, "delete from public.teams where id = $1", [teams[0]]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("does not let the count drift from the real teams", async () => {
    const { id } = await publishedLeague("public", 5);
    await expect(
      db.asUser(creator, "update public.leagues set team_count = 6 where id = $1", [id]),
    ).rejects.toThrow(/team_count_must_match_teams/);
  });

  it("lets the deadline move until it passes, but never into the past", async () => {
    const { id } = await publishedLeague();
    await db.asUser(creator, "update public.leagues set deadline = '2098-01-01' where id = $1", [id]);
    await expect(
      db.asUser(creator, "update public.leagues set deadline = now() - interval '1 day' where id = $1", [id]),
    ).rejects.toThrow(/deadline_must_be_in_the_future/);
  });

  it("locks the league and its teams after the deadline", async () => {
    const { id, teams } = await publishedLeague();
    await db.passDeadline(id);

    // Row security filters these out, so nothing changes and no error is raised.
    await db.asUser(creator, "update public.leagues set deadline = '2099-06-01', name = 'Reopened' where id = $1", [id]);
    await db.asUser(creator, "update public.teams set name = 'Changed' where id = $1", [teams[0]]);
    await db.asUser(creator, "delete from public.teams where id = $1", [teams[0]]);
    await db.asUser(creator, "delete from public.leagues where id = $1", [id]);

    const league = await db.pg.query<{ name: string }>("select name from public.leagues where id = $1", [id]);
    expect(league.rows[0].name).toBe("Test League");
    const team = await db.pg.query<{ name: string }>("select name from public.teams where id = $1", [teams[0]]);
    expect(team.rows[0].name).toBe("Team 01");

    await expect(
      db.asUser(creator, "insert into public.teams (league_id, name) values ($1, 'Late')", [id]),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks reopening at the database level, even for admins", async () => {
    const { id } = await publishedLeague();
    await db.passDeadline(id);
    await expect(
      db.pg.query("update public.leagues set deadline = '2099-06-01' where id = $1", [id]),
    ).rejects.toThrow(/league_locked_after_deadline/);
  });

  it("lets creators delete before the deadline, and admins any time", async () => {
    const before = await publishedLeague();
    await db.asUser(creator, "delete from public.leagues where id = $1", [before.id]);
    expect((await db.pg.query("select id from public.leagues where id = $1", [before.id])).rows).toHaveLength(0);

    const after = await publishedLeague();
    await db.passDeadline(after.id);
    await db.asUser(admin, "delete from public.leagues where id = $1", [after.id]);
    expect((await db.pg.query("select id from public.leagues where id = $1", [after.id])).rows).toHaveLength(0);
  });
});

describe("scoring function", () => {
  const score = async (
    predicted: string[],
    actual: string[],
    zones: [number, number | null, number | null, number] = [0, null, null, 0],
  ) => {
    const { rows } = await db.pg.query<{
      base_points: number;
      bonus_points: number;
      exact_count: number;
    }>("select * from private.score_prediction($1::uuid[], $2::uuid[], $3, $4, $5, $6)", [
      predicted,
      actual,
      ...zones,
    ]);
    return rows[0];
  };
  const ids = Array.from(
    { length: 20 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  const moved = (from: number, to: number) => {
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  };

  it("matches the examples in the spec for a team predicted 3rd", async () => {
    // Exact: all 20 teams score 20.
    expect((await score(ids, ids)).base_points).toBe(400);
    // Actually 5th: that team scores 18, and the two teams it passed are one off, scoring 19 each.
    expect((await score(ids, moved(2, 4))).base_points).toBe(400 - 2 - 1 - 1);
    // Actually 20th: that team scores 3, and the 17 teams it passed are one off.
    expect((await score(ids, moved(2, 19))).base_points).toBe(400 - 17 - 17);
  });

  it("gives a perfect 20-team table every point, using the spec's zones", async () => {
    // 20 x 20 base, +10 champion, +5 x 2 promoted, +3 x 4 playoff, +5 x 3 relegated.
    expect(await score(ids, ids, [2, 3, 6, 3])).toEqual({
      base_points: 400,
      bonus_points: 47,
      exact_count: 20,
    });
  });

  it("only awards the champion bonus when zones are off", async () => {
    expect((await score(ids, ids)).bonus_points).toBe(10);
  });

  it("awards zone bonuses for the right zone, even at the wrong position", async () => {
    const actual = [...ids];
    [actual[0], actual[1]] = [actual[1], actual[0]];
    // No champion bonus, but both teams were still promoted.
    expect((await score(ids, actual, [2, null, null, 0])).bonus_points).toBe(10);
  });

  it("gives no bonus when a team leaves its zone", async () => {
    const actual = [...ids];
    [actual[1], actual[2]] = [actual[2], actual[1]];
    // Champion +10 and one promoted team +5. The other promoted pick dropped out of the zone.
    expect((await score(ids, actual, [2, null, null, 0])).bonus_points).toBe(15);
  });
});

describe("standings and the leaderboard", () => {
  type ScoreRow = {
    user_id: string;
    base_points: number;
    bonus_points: number;
    exact_count: number;
    rank: number;
    previous_rank: number | null;
  };
  const leaderboard = (leagueId: string) =>
    db.pg
      .query<ScoreRow>(
        `select p.user_id, s.base_points, s.bonus_points, s.exact_count, s.rank, s.previous_rank
         from public.prediction_scores s
         join public.predictions p on p.id = s.prediction_id
         join public.standings_updates u on u.id = s.standings_update_id
         where u.league_id = $1
           and u.version = (select max(version) from public.standings_updates where league_id = $1)`,
        [leagueId],
      )
      .then((result) => result.rows);

  async function liveLeague() {
    const league = await publishedLeague();
    await join(alice, league.id);
    await join(bob, league.id);
    return league;
  }

  it("only lets the creator or an admin update standings", async () => {
    const { id, teams } = await liveLeague();
    await db.passDeadline(id);
    await expect(updateStandings(alice, id, teams)).rejects.toThrow(/league_not_found/);
    await expect(updateStandings(creator, id, teams)).resolves.toBeTruthy();
    await expect(updateStandings(admin, id, teams)).resolves.toBeTruthy();
  });

  it("does not accept standings before the deadline or incomplete tables", async () => {
    const { id, teams } = await liveLeague();
    await expect(updateStandings(creator, id, teams)).rejects.toThrow(/deadline_not_reached/);
    await db.passDeadline(id);
    await expect(updateStandings(creator, id, teams.slice(1))).rejects.toThrow(/invalid_team_order/);
  });

  it("does not allow scores or standings to be written directly", async () => {
    const { id, teams } = await liveLeague();
    await submit(alice, id, teams);
    await db.passDeadline(id);
    await updateStandings(creator, id, teams);
    await expect(
      db.asUser(alice, "update public.prediction_scores set base_points = 9999"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(creator, "insert into public.standings_updates (league_id, version, team_order) values ($1, 99, $2)", [
        id,
        teams,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("scores and ranks players, breaking ties on exact positions", async () => {
    const { id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await join(outsider, id);
    await submit(alice, id, [a, b, c, d]); // perfect: 16 base + 10 champion
    await submit(bob, id, [b, a, d, c]); // each team one off: 12 base, 0 exact
    await submit(creator, id, [a, b, d, c]); // 2 exact, 2 one off: 14 base + 10 champion
    await db.passDeadline(id);
    await updateStandings(creator, id, teams);

    const rows = await leaderboard(id);
    const byUser = (user: string) => rows.find((row) => row.user_id === user);
    expect(byUser(alice)).toMatchObject({ base_points: 16, bonus_points: 10, exact_count: 4, rank: 1 });
    expect(byUser(creator)).toMatchObject({ base_points: 14, bonus_points: 10, exact_count: 2, rank: 2 });
    expect(byUser(bob)).toMatchObject({ base_points: 12, bonus_points: 0, exact_count: 0, rank: 3 });
    expect(byUser(outsider)).toBeUndefined();
  });

  it("uses exact positions to separate equal points, and shares the rank when still level", async () => {
    const { id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await join(outsider, id);
    await submit(alice, id, [a, b, c, d]);
    await submit(bob, id, [a, b, c, d]);
    await submit(outsider, id, [d, c, b, a]);
    await db.passDeadline(id);
    await updateStandings(creator, id, teams);

    const rows = await leaderboard(id);
    expect(rows.find((row) => row.user_id === alice)?.rank).toBe(1);
    expect(rows.find((row) => row.user_id === bob)?.rank).toBe(1);
    expect(rows.find((row) => row.user_id === outsider)?.rank).toBe(3);
  });

  it("tracks rank movement and keeps only two sets of scores", async () => {
    const { id, teams } = await liveLeague();
    const [a, b, c, d] = teams;
    await submit(alice, id, [a, b, c, d]);
    await submit(bob, id, [d, c, b, a]);
    await db.passDeadline(id);

    await updateStandings(creator, id, [a, b, c, d]);
    expect((await leaderboard(id)).find((row) => row.user_id === alice)).toMatchObject({
      rank: 1,
      previous_rank: null,
    });

    await updateStandings(creator, id, [d, c, b, a]);
    expect((await leaderboard(id)).find((row) => row.user_id === alice)).toMatchObject({
      rank: 2,
      previous_rank: 1,
    });

    await updateStandings(creator, id, [a, b, c, d]);
    expect((await leaderboard(id)).find((row) => row.user_id === alice)).toMatchObject({
      rank: 1,
      previous_rank: 2,
    });

    const { rows } = await db.pg.query<{ versions: number }>(
      `select count(distinct s.standings_update_id)::int as versions
       from public.prediction_scores s
       join public.standings_updates u on u.id = s.standings_update_id
       where u.league_id = $1`,
      [id],
    );
    expect(rows[0].versions).toBe(2);

    const history = await db.asUser<{ version: number; updated_by: string }>(
      alice,
      "select version, updated_by from public.standings_updates where league_id = $1 order by version",
      [id],
    );
    expect(history.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(history[0].updated_by).toBe(creator);
  });

  it("leaves predictions awaiting review off the leaderboard", async () => {
    const { id, teams } = await publishedLeague("public", 5);
    await join(alice, id);
    await submit(alice, id, teams);
    await db.asUser(creator, "delete from public.teams where id = $1", [teams[4]]);
    await db.passDeadline(id);
    await updateStandings(creator, id, teams.slice(0, 4));
    expect(await leaderboard(id)).toHaveLength(0);
  });

  it("finishes only after standings exist, then stops further updates", async () => {
    const { id, teams } = await liveLeague();
    await expect(db.asUser(creator, "select public.finish_league($1)", [id])).rejects.toThrow(
      /league_not_live/,
    );
    await db.passDeadline(id);
    await expect(db.asUser(creator, "select public.finish_league($1)", [id])).rejects.toThrow(
      /no_standings_yet/,
    );
    await updateStandings(creator, id, teams);
    await expect(db.asUser(alice, "select public.finish_league($1)", [id])).rejects.toThrow(
      /league_not_found/,
    );
    await db.asUser(creator, "select public.finish_league($1)", [id]);
    await expect(updateStandings(creator, id, teams)).rejects.toThrow(/league_not_live/);
  });

  it("only lets admins reopen a finished league", async () => {
    const { id, teams } = await liveLeague();
    await db.passDeadline(id);
    await updateStandings(creator, id, teams);
    await db.asUser(creator, "select public.finish_league($1)", [id]);
    await expect(db.asUser(creator, "select public.reopen_league($1)", [id])).rejects.toThrow(
      /admin_only/,
    );
    await db.asUser(admin, "select public.reopen_league($1)", [id]);
    await expect(updateStandings(creator, id, teams)).resolves.toBeTruthy();
  });
});

describe("reports", () => {
  const report = (user: string, leagueId: string, teamId: string | null = null) =>
    db.asUser(user, "insert into public.reports (league_id, team_id, reason) values ($1, $2, 'Offensive')", [
      leagueId,
      teamId,
    ]);

  it("lets users report what they can see", async () => {
    const { id, teams } = await publishedLeague();
    await expect(report(alice, id, teams[0])).resolves.toBeDefined();
  });

  it("rejects reports on leagues the user can't see, or teams from other leagues", async () => {
    const hiddenFromAlice = await publishedLeague("private");
    await expect(report(alice, hiddenFromAlice.id)).rejects.toThrow(/row-level security/);

    const { id } = await publishedLeague();
    const other = await publishedLeague();
    await expect(report(alice, id, other.teams[0])).rejects.toThrow(/row-level security/);
  });

  it("only shows reports to their author and admins, and only admins can review them", async () => {
    const { id } = await publishedLeague();
    await report(alice, id);
    const sql = "select id from public.reports where league_id = $1";
    expect(await db.asUser(alice, sql, [id])).toHaveLength(1);
    expect(await db.asUser(bob, sql, [id])).toHaveLength(0);
    expect(await db.asUser(admin, sql, [id])).toHaveLength(1);

    await db.asUser(alice, "update public.reports set status = 'dismissed' where league_id = $1", [id]);
    await db.asUser(admin, "update public.reports set status = 'actioned' where league_id = $1", [id]);
    const { rows } = await db.pg.query<{ status: string }>(
      "select status from public.reports where league_id = $1",
      [id],
    );
    expect(rows[0].status).toBe("actioned");
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
});
