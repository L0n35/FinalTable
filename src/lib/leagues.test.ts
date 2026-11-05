import { describe, expect, it } from "vitest";
import {
  initialsFor,
  leagueNoun,
  leagueTypeLabel,
  listedSport,
  readStartKind,
  SPORT_OPTIONS,
  surfaceFor,
  zoneProblem,
  type LeagueType,
} from "@/lib/leagues";
import { zoneFor } from "@/lib/zones";

describe("league wording", () => {
  const COMPETITION = "a-competition";

  it.each<[LeagueType, string | null, "league" | "group", string]>([
    ["official", COMPETITION, "league", "Global league"],
    ["public", null, "league", "Public league"],
    ["private", null, "league", "Private league"],
    ["public", COMPETITION, "group", "Public group"],
    ["private", COMPETITION, "group", "Private group"],
  ])("calls a %s league on competition %s a %s", (type, competition_id, noun, label) => {
    expect(leagueNoun({ type, competition_id })).toBe(noun);
    expect(leagueTypeLabel({ type, competition_id })).toBe(label);
  });
});

describe("readStartKind", () => {
  it("opens the choice a link asks for", () => {
    expect(readStartKind("custom", false)).toBe("custom");
    expect(readStartKind("preset", false)).toBe("preset");
  });

  it("only lets admins start an official league", () => {
    expect(readStartKind("official", true)).toBe("official");
    expect(readStartKind("official", false)).toBeNull();
  });

  it("ignores anything else, including a repeated query parameter", () => {
    expect(readStartKind(undefined, true)).toBeNull();
    expect(readStartKind("nonsense", true)).toBeNull();
    expect(readStartKind(["custom", "preset"], true)).toBeNull();
  });
});

describe("sport options", () => {
  it.each(SPORT_OPTIONS)("gives %s a ground of its own", (sport) => {
    expect(surfaceFor(sport)).not.toBe("plain");
  });

  it("recognises a listed sport however it was typed", () => {
    expect(listedSport("  football ")).toBe("Football");
    expect(listedSport("RUGBY LEAGUE")).toBe("Rugby league");
  });

  it("leaves anything else as the creator typed it", () => {
    expect(listedSport("Darts")).toBeNull();
    expect(listedSport("")).toBeNull();
  });
});

describe("initialsFor", () => {
  it.each([
    ["Northgate City", "NC"],
    ["Glenhaven", "GL"],
    ["  ashford   rovers  town ", "AR"],
    ["", "?"],
  ])("turns %j into %s", (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });
});

describe("surfaceFor", () => {
  it.each([
    ["Football", "football"],
    ["Basketball", "court"],
    ["Cricket", "cricket"],
    ["Aussie rules", "aussie-rules"],
    ["Rugby league", "rugby"],
    ["Motorsport", "track"],
    ["Formula 1", "track"],
  ])("puts %s on the %s surface", (sport, surface) => {
    expect(surfaceFor(sport)).toBe(surface);
  });

  it("ignores case and spare spaces, because people can type the sport themselves", () => {
    expect(surfaceFor("  football ")).toBe("football");
    expect(surfaceFor("F1")).toBe("track");
  });

  it("gives anything it doesn't know a plain ground", () => {
    expect(surfaceFor("squash")).toBe("plain");
    expect(surfaceFor("")).toBe("plain");
    expect(surfaceFor(null)).toBe("plain");
  });
});

describe("zoneFor", () => {
  const zones = { promotion: 2, playoffFrom: 3, playoffTo: 6, relegation: 3 };

  it("places each position in the right zone", () => {
    expect(zoneFor(2, 20, zones)).toBe("promotion");
    expect(zoneFor(3, 20, zones)).toBe("playoff");
    expect(zoneFor(7, 20, zones)).toBeNull();
    expect(zoneFor(18, 20, zones)).toBe("relegation");
  });

  it("copes with leagues that have no zones", () => {
    const none = { promotion: 0, playoffFrom: null, playoffTo: null, relegation: 0 };
    expect(zoneFor(1, 10, none)).toBeNull();
    expect(zoneFor(10, 10, none)).toBeNull();
  });
});

describe("zoneProblem", () => {
  const zones = { promotion: 0, playoffFrom: null, playoffTo: null, relegation: 0 };

  it("accepts valid zones", () => {
    expect(zoneProblem(zones, 10)).toBeNull();
    expect(zoneProblem({ promotion: 2, playoffFrom: 3, playoffTo: 6, relegation: 3 }, 20)).toBeNull();
  });

  it.each([
    [{ ...zones, promotion: 3, relegation: 2 }, 4],
    [{ ...zones, promotion: 3, playoffFrom: 3, playoffTo: 5 }, 10],
    [{ ...zones, relegation: 3, playoffFrom: 5, playoffTo: 8 }, 10],
    [{ ...zones, playoffFrom: 6, playoffTo: 3 }, 10],
  ])("reports a problem with %j in %i teams", (input, total) => {
    expect(zoneProblem(input, total)).toEqual(expect.any(String));
  });
});
