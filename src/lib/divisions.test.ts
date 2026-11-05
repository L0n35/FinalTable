import { describe, expect, it } from "vitest";
import { groupedOrder, listNames, positionsIn, tablesOf, tableSizes, withTable } from "@/lib/divisions";

const east = { id: "east", name: "East", position: 1 };
const west = { id: "west", name: "West", position: 2 };
const divisions = [east, west];
const teams = [
  { id: "e1", divisionId: "east" },
  { id: "e2", divisionId: "east" },
  { id: "w1", divisionId: "west" },
  { id: "w2", divisionId: "west" },
  { id: "w3", divisionId: "west" },
];

describe("tablesOf", () => {
  it("gives a season with no conferences one table with every team, in the same order", () => {
    const order = ["w2", "e1", "w1"];
    expect(tablesOf(order, teams, [])).toEqual([{ division: null, order }]);
  });

  it("filters the full order to each conference, keeping its order", () => {
    expect(tablesOf(["w2", "e2", "w1", "e1", "w3"], teams, divisions)).toEqual([
      { division: east, order: ["e2", "e1"] },
      { division: west, order: ["w2", "w1", "w3"] },
    ]);
  });
});

describe("groupedOrder", () => {
  it("puts each conference's teams together", () => {
    expect(groupedOrder(["w2", "e2", "w1", "e1", "w3"], teams, divisions)).toEqual(["e2", "e1", "w2", "w1", "w3"]);
  });

  it("leaves a season with no conferences alone", () => {
    expect(groupedOrder(["w2", "e2", "w1"], teams, [])).toEqual(["w2", "e2", "w1"]);
  });
});

describe("withTable", () => {
  it("changes one conference and leaves the other where it is", () => {
    expect(withTable(["e1", "e2", "w1", "w2", "w3"], ["w3", "w1", "w2"])).toEqual(["e1", "e2", "w3", "w1", "w2"]);
  });

  it("fills a table's own slots, even when the teams are mixed together", () => {
    expect(withTable(["w1", "e1", "w2", "e2", "w3"], ["e2", "e1"])).toEqual(["w1", "e2", "w2", "e1", "w3"]);
  });

  it("replaces everything when a season has one table", () => {
    expect(withTable(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });
});

describe("positionsIn", () => {
  it("counts from the top of each team's own conference", () => {
    const positions = positionsIn(["e2", "e1", "w2", "w1", "w3"], teams, divisions);
    expect(positions.get("e2")).toBe(1);
    expect(positions.get("e1")).toBe(2);
    expect(positions.get("w2")).toBe(1);
    expect(positions.get("w3")).toBe(3);
  });

  it("is the plain position when there are no conferences", () => {
    expect(positionsIn(["w2", "e2"], teams, []).get("e2")).toBe(2);
  });
});

describe("tableSizes", () => {
  it("counts each conference", () => {
    expect(tableSizes(teams, divisions)).toEqual([2, 3]);
  });

  it("counts every team when there are no conferences", () => {
    expect(tableSizes(teams, [])).toEqual([5]);
  });
});

describe("listNames", () => {
  it.each([
    [[], ""],
    [["East"], "East"],
    [["East", "West"], "East and West"],
    [["North", "South", "West"], "North, South and West"],
  ])("reads %j as %j", (names, expected) => {
    expect(listNames(names)).toBe(expected);
  });
});
