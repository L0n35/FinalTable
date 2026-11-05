import type { Team } from "@/lib/leagues";

// A conference, or another part of a league with its own table. A prediction or standings update is
// one list of every team, and a conference's table is that list filtered to its teams.
export type Division = { id: string; name: string; position: number };

export const DIVISION_COLUMNS = "id, name, position";

// One table in a season. A season with no conferences has a single table with no division.
export type TableOrder = { division: Division | null; order: string[] };

type TeamInDivision = Pick<Team, "id" | "divisionId">;

export function tablesOf(order: string[], teams: TeamInDivision[], divisions: Division[]): TableOrder[] {
  if (divisions.length === 0) return [{ division: null, order }];
  const divisionOf = new Map(teams.map((team) => [team.id, team.divisionId]));
  return divisions.map((division) => ({
    division,
    order: order.filter((id) => divisionOf.get(id) === division.id),
  }));
}

// Puts each conference's teams together, keeping their order, so screens can work on one block at a time.
export function groupedOrder(order: string[], teams: TeamInDivision[], divisions: Division[]): string[] {
  return tablesOf(order, teams, divisions).flatMap((table) => table.order);
}

// Swaps one table into the full order, leaving every other team where it is.
export function withTable(order: string[], table: string[]): string[] {
  const inTable = new Set(table);
  let next = 0;
  return order.map((id) => (inTable.has(id) ? table[next++] : id));
}

// Each team's position within its own table.
export function positionsIn(order: string[], teams: TeamInDivision[], divisions: Division[]): Map<string, number> {
  return new Map(
    tablesOf(order, teams, divisions).flatMap((table) =>
      table.order.map((id, index): [string, number] => [id, index + 1]),
    ),
  );
}

export function tableSizes(teams: TeamInDivision[], divisions: Division[]): number[] {
  return tablesOf(
    teams.map((team) => team.id),
    teams,
    divisions,
  ).map((table) => table.order.length);
}

// "East", "East and West", or "North, South and West".
export function listNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
