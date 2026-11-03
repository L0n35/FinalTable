import { describe, expect, it } from "vitest";
import { initialsFor, zoneProblem } from "@/lib/leagues";
import { zoneFor } from "@/lib/zones";

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
