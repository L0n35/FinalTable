import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let admin: string;
let creator: string;
let alice: string;

type TeamInput = {
  id?: string;
  name: string;
  logo_path?: string | null;
  colour_primary?: string;
  colour_secondary?: string;
};

const named = (...names: string[]): TeamInput[] => names.map((name) => ({ name }));

async function draftLeague(teamCount = 4) {
  const [{ id }] = await db.asUser<{ id: string }>(
    creator,
    "insert into public.leagues (name, type, team_count, deadline) values ('Setup', 'public', $1, '2099-01-01') returning id",
    [teamCount],
  );
  return id;
}

const save = (user: string, leagueId: string, teams: TeamInput[], count = teams.length) =>
  db.asUser(user, "select public.save_league_teams($1, $2, $3::jsonb)", [
    leagueId,
    count,
    JSON.stringify(teams),
  ]);

const teamsOf = async (leagueId: string) =>
  (
    await db.pg.query<{ id: string; name: string; logo_path: string | null; colour_primary: string }>(
      "select id, name, logo_path, colour_primary from public.teams where league_id = $1 order by name",
      [leagueId],
    )
  ).rows;

const publish = (leagueId: string) =>
  db.asUser(creator, "select public.publish_league($1)", [leagueId]);

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("Admin", { admin: true });
  creator = await db.createUser("Creator");
  alice = await db.createUser("Alice");
});

beforeEach(async () => {
  await db.pg.exec("delete from public.leagues");
});

describe("saving a team list", () => {
  it("creates teams and sets the draft's team count", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale", "Elm"));
    expect((await teamsOf(id)).map((team) => team.name)).toEqual(["Ash", "Birch", "Cedar", "Dale", "Elm"]);
    const { rows } = await db.pg.query<{ team_count: number }>(
      "select team_count from public.leagues where id = $1",
      [id],
    );
    expect(rows[0].team_count).toBe(5);
  });

  it("keeps a partial draft that can't be published until it's complete", async () => {
    const id = await draftLeague(6);
    await save(creator, id, named("Ash", "Birch"), 6);
    await expect(publish(id)).rejects.toThrow(/team_count_must_match_teams/);
  });

  it("updates, adds and removes teams in one save", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    const [ash, birch] = await teamsOf(id);
    await save(creator, id, [
      { id: ash.id, name: "Ash Town", colour_primary: "#112233" },
      { id: birch.id, name: "Birch" },
      { name: "Elm" },
      { name: "Fir" },
    ]);
    const teams = await teamsOf(id);
    expect(teams.map((team) => team.name)).toEqual(["Ash Town", "Birch", "Elm", "Fir"]);
    expect(teams[0]).toMatchObject({ id: ash.id, colour_primary: "#112233" });
  });

  it("lets teams swap names and reuse a removed team's name", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    const [ash, birch, cedar, dale] = await teamsOf(id);
    await save(creator, id, [
      { id: ash.id, name: "Birch" },
      { id: birch.id, name: "Ash" },
      { id: cedar.id, name: "Cedar" },
      { name: "Dale" },
    ]);
    const teams = await teamsOf(id);
    expect(teams.find((team) => team.name === "Birch")?.id).toBe(ash.id);
    expect(teams.find((team) => team.name === "Ash")?.id).toBe(birch.id);
    expect(teams.find((team) => team.name === "Dale")?.id).not.toBe(dale.id);
    expect(teams).toHaveLength(4);
  });

  it("rejects duplicate names, ignoring case and spaces, and leaves the league unchanged", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    await expect(save(creator, id, named("Elm", " ELM ", "Fir", "Oak"))).rejects.toThrow(
      /duplicate_team_name/,
    );
    expect((await teamsOf(id)).map((team) => team.name)).toEqual(["Ash", "Birch", "Cedar", "Dale"]);
  });

  it("rolls everything back when one team is invalid", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    await expect(
      save(creator, id, [...named("Elm", "Fir", "Oak"), { name: "Pine", colour_primary: "red" }]),
    ).rejects.toThrow(/violates check constraint/);
    expect((await teamsOf(id)).map((team) => team.name)).toEqual(["Ash", "Birch", "Cedar", "Dale"]);
  });

  it("rejects team ids from another league", async () => {
    const id = await draftLeague();
    const other = await draftLeague();
    await save(creator, other, named("Ash", "Birch", "Cedar", "Dale"));
    const [foreign] = await teamsOf(other);
    await expect(save(creator, id, [{ id: foreign.id, name: "Stolen" }])).rejects.toThrow(/invalid_teams/);
  });

  it("rejects logos stored under another league", async () => {
    const id = await draftLeague();
    const other = await draftLeague();
    await expect(
      save(creator, id, [{ name: "Ash", logo_path: `${other}/logo.webp` }]),
    ).rejects.toThrow(/invalid_teams/);
    await expect(
      save(creator, id, [{ name: "Ash", logo_path: `${id}/logo.webp` }], 4),
    ).resolves.toBeDefined();
  });

  it("only lets the creator or an admin save teams", async () => {
    const id = await draftLeague();
    await expect(save(alice, id, named("Ash"), 4)).rejects.toThrow(/league_not_found/);
    await expect(save(admin, id, named("Ash"), 4)).resolves.toBeDefined();
    await expect(
      db.asUser(null, "select public.save_league_teams($1, 4, '[]'::jsonb)", [id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("saving teams on a published league", () => {
  async function publishedWithPrediction() {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    await publish(id);
    const teams = await teamsOf(id);
    await db.asUser(alice, "select public.join_league($1)", [id]);
    await db.asUser(alice, "select public.submit_prediction($1, $2)", [
      id,
      teams.map((team) => team.id),
    ]);
    return { id, teams };
  }

  const needsReview = async (leagueId: string) =>
    (
      await db.pg.query<{ needs_review: boolean }>(
        "select needs_review from public.predictions where league_id = $1",
        [leagueId],
      )
    ).rows[0].needs_review;

  it("keeps predictions valid when teams are only renamed or restyled", async () => {
    const { id, teams } = await publishedWithPrediction();
    await save(
      creator,
      id,
      teams.map((team) => ({ id: team.id, name: `${team.name} FC`, colour_primary: "#123456" })),
    );
    expect(await needsReview(id)).toBe(false);
  });

  it("flags predictions and syncs the count when the set of teams changes", async () => {
    const { id, teams } = await publishedWithPrediction();
    await save(creator, id, [...teams.map((team) => ({ id: team.id, name: team.name })), { name: "Elm" }]);
    expect(await needsReview(id)).toBe(true);
    const { rows } = await db.pg.query<{ team_count: number }>(
      "select team_count from public.leagues where id = $1",
      [id],
    );
    expect(rows[0].team_count).toBe(5);
  });

  it("lets a team at the minimum be swapped for a new one", async () => {
    const { id, teams } = await publishedWithPrediction();
    await save(creator, id, [
      ...teams.slice(0, 3).map((team) => ({ id: team.id, name: team.name })),
      { name: "Elm" },
    ]);
    expect((await teamsOf(id)).map((team) => team.name)).toEqual(["Ash", "Birch", "Cedar", "Elm"]);
  });

  it("does not let a published league go below the minimum", async () => {
    const { id, teams } = await publishedWithPrediction();
    await expect(
      save(creator, id, teams.slice(0, 3).map((team) => ({ id: team.id, name: team.name }))),
    ).rejects.toThrow(/team_count_out_of_range/);
  });

  it("locks teams after the deadline", async () => {
    const { id, teams } = await publishedWithPrediction();
    await db.passDeadline(id);
    await expect(
      save(creator, id, teams.map((team) => ({ id: team.id, name: "Late" + team.name }))),
    ).rejects.toThrow(/league_not_found/);
  });
});

describe("admin check", () => {
  it("reports the signed-in user's own status only", async () => {
    const sql = "select public.current_user_is_admin() as admin";
    expect(await db.asUser(admin, sql)).toEqual([{ admin: true }]);
    expect(await db.asUser(alice, sql)).toEqual([{ admin: false }]);
    await expect(db.asUser(null, sql)).rejects.toThrow(/permission denied/);
  });
});

describe("logo storage", () => {
  const upload = (user: string, name: string, bucket = "team-logos") =>
    db.asUser(user, "insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);

  beforeEach(async () => {
    await db.pg.exec("delete from storage.objects");
    await db.pg.exec("insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing");
  });

  it("creates a public bucket limited to small raster images", async () => {
    const { rows } = await db.pg.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-logos'");
    expect(rows[0].public).toBe(true);
    expect(Number(rows[0].file_size_limit)).toBe(204800);
    expect(rows[0].allowed_mime_types).toEqual(["image/webp", "image/png", "image/jpeg"]);
    expect(rows[0].allowed_mime_types).not.toContain("image/svg+xml");
  });

  it("lets creators upload to their own league's folder only", async () => {
    const id = await draftLeague();
    await expect(upload(creator, `${id}/logo.webp`)).resolves.toBeDefined();
    await expect(upload(alice, `${id}/logo.webp`)).rejects.toThrow(/row-level security/);
  });

  it("rejects malformed paths and other buckets", async () => {
    const id = await draftLeague();
    await expect(upload(creator, "logo.webp")).rejects.toThrow(/row-level security/);
    await expect(upload(creator, "not-a-uuid/logo.webp")).rejects.toThrow(/row-level security/);
    await expect(upload(creator, `${id}/logo.webp`, "other")).rejects.toThrow(/row-level security/);
  });

  it("stops uploads after the deadline", async () => {
    const id = await draftLeague();
    await save(creator, id, named("Ash", "Birch", "Cedar", "Dale"));
    await publish(id);
    await db.passDeadline(id);
    await expect(upload(creator, `${id}/late.webp`)).rejects.toThrow(/row-level security/);
  });

  it("only lets the league's creator remove its logos", async () => {
    const id = await draftLeague();
    await upload(creator, `${id}/logo.webp`);
    await db.asUser(alice, "delete from storage.objects where name = $1", [`${id}/logo.webp`]);
    expect((await db.pg.query("select id from storage.objects")).rows).toHaveLength(1);
    await db.asUser(creator, "delete from storage.objects where name = $1", [`${id}/logo.webp`]);
    expect((await db.pg.query("select id from storage.objects")).rows).toHaveLength(0);
  });
});
