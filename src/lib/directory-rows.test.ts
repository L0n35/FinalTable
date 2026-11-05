import { describe, expect, it } from "vitest";
import {
  accentsByCompetition,
  crowdLine,
  leaderLine,
  playerCountLabel,
  playerCountLine,
  sportsIn,
  splitDirectory,
  teamsLine,
  type DirectoryRow,
} from "@/lib/directory-rows";
import { formatShortDate, timeLeft } from "@/lib/leagues";

const row = (overrides: Partial<DirectoryRow>): DirectoryRow => ({
  competition_id: "c",
  competition_name: "Test League",
  sport: "Football",
  accent: null,
  sort_order: 100,
  state: "open",
  opens_note: null,
  league_id: "l",
  slug: "s",
  season_id: "x",
  season_label: "2027",
  team_count: 10,
  deadline: "2027-01-01T00:00:00Z",
  entrant_count: null,
  crowd_team: null,
  crowd_percent: null,
  leader_name: null,
  leader_points: null,
  badges: null,
  ...overrides,
});

describe("splitDirectory", () => {
  it("puts whatever locks soonest first", () => {
    const { open } = splitDirectory([
      row({ league_id: "later", deadline: "2027-03-01T00:00:00Z" }),
      row({ league_id: "sooner", deadline: "2027-02-01T00:00:00Z" }),
    ]);
    expect(open.map((item) => item.league_id)).toEqual(["sooner", "later"]);
  });

  it("settles a tie on the deadline by the directory's own order", () => {
    const { open } = splitDirectory([
      row({ league_id: "second", sort_order: 101 }),
      row({ league_id: "first", sort_order: 100 }),
    ]);
    expect(open.map((item) => item.league_id)).toEqual(["first", "second"]);
  });

  it("puts the busiest live league first, then the directory's own order", () => {
    const { live } = splitDirectory([
      row({ league_id: "second", state: "live", entrant_count: 3, sort_order: 5 }),
      row({ league_id: "first", state: "live", entrant_count: 17, sort_order: 50 }),
      row({ league_id: "third", state: "live", entrant_count: 3, sort_order: 6 }),
    ]);
    expect(live.map((item) => item.league_id)).toEqual(["first", "second", "third"]);
  });

  it("puts the latest finished season first", () => {
    const { finished } = splitDirectory([
      row({ league_id: "old", state: "finished", deadline: "2025-01-01T00:00:00Z" }),
      row({ league_id: "new", state: "finished", deadline: "2026-01-01T00:00:00Z" }),
    ]);
    expect(finished.map((item) => item.league_id)).toEqual(["new", "old"]);
  });

  it("keeps competitions with nothing open apart, in the directory's own order", () => {
    const { comingSoon, open } = splitDirectory([
      row({ competition_name: "Later", state: "coming_soon", sort_order: 20, league_id: null, slug: null, deadline: null }),
      row({ competition_name: "Earlier", state: "coming_soon", sort_order: 10, league_id: null, slug: null, deadline: null }),
    ]);
    expect(comingSoon.map((item) => item.competition_name)).toEqual(["Earlier", "Later"]);
    expect(open).toEqual([]);
  });
});

describe("sportsIn", () => {
  it("lists each sport once, in the directory's own order", () => {
    expect(
      sportsIn([
        row({ sport: "Cricket", sort_order: 30 }),
        row({ sport: "Football", sort_order: 10 }),
        row({ sport: "Football", sort_order: 40 }),
      ]),
    ).toEqual(["Football", "Cricket"]);
  });
});

describe("card lines", () => {
  it("only shows a player count from 10 players", () => {
    expect(playerCountLine(row({ entrant_count: null }))).toBeNull();
    expect(playerCountLine(row({ entrant_count: 9 }))).toBeNull();
    expect(playerCountLine(row({ entrant_count: 10 }))).toBe("10 players");
  });

  it("explains the crowd's pick in plain words", () => {
    expect(crowdLine(row({ crowd_team: "Arsenal", crowd_percent: 40 }))).toBe("40% picked Arsenal to finish top");
    expect(
      crowdLine(
        row({
          crowd_picks: [
            { division: "East", team: "Inter Miami", percent: 40 },
            { division: "West", team: "LAFC", percent: 35 },
          ],
        }),
      ),
    ).toBe("To finish top: Inter Miami 40%, LAFC 35%");
    expect(crowdLine(row({}))).toBeNull();
  });

  it("names the leader, or the winner once the season has finished", () => {
    expect(leaderLine(row({ state: "live", leader_name: "Alex P.", leader_points: 120 }))).toBe(
      "Leading: Alex P. · 120 pts",
    );
    expect(leaderLine(row({ state: "finished", leader_name: "Alex P.", leader_points: 1 }))).toBe(
      "Won by Alex P. · 1 pt",
    );
    expect(leaderLine(row({ state: "live" }))).toBeNull();
  });

  it("counts a single player correctly", () => {
    expect(playerCountLabel(1)).toBe("1 player");
    expect(playerCountLabel(17)).toBe("17 players");
  });
});

describe("teamsLine", () => {
  it("gives the season and team count", () => {
    expect(teamsLine({ season_label: "2027", team_count: 18 })).toBe("2027 · 18 teams");
    expect(teamsLine({ season_label: "2027", team_count: 18, division_names: null })).toBe("2027 · 18 teams");
  });

  it("names a league's conferences", () => {
    expect(teamsLine({ season_label: "2027 Sprint", team_count: 30, division_names: ["East", "West"] })).toBe(
      "2027 Sprint · 30 teams · East and West",
    );
  });
});

describe("accentsByCompetition", () => {
  it("skips competitions with no colour", () => {
    const accents = accentsByCompetition([
      row({ competition_name: "A", accent: "#112233" }),
      row({ competition_name: "B", accent: null }),
    ]);
    expect(accents.get("A")).toBe("#112233");
    expect(accents.has("B")).toBe(false);
  });
});

describe("timeLeft", () => {
  const NOW = Date.UTC(2027, 0, 1);
  const MINUTE = 60_000;

  it.each([
    [108 * 1440, "108 days left"],
    [2 * 1440, "2 days left"],
    [2 * 1440 - 1, "47h 59m left"],
    [90, "1h 30m left"],
    [59, "59m left"],
    [0, "0m left"],
    [-30, "0m left"],
  ])("with %i minutes to go, says %s", (minutes, expected) => {
    expect(timeLeft(NOW + minutes * MINUTE, NOW)).toBe(expected);
  });
});

describe("formatShortDate", () => {
  it("gives the same text on the server and in a fixed zone", () => {
    expect(formatShortDate("2027-02-20T01:00:00Z", "UTC")).toBe("Sat 20 Feb");
  });
});
