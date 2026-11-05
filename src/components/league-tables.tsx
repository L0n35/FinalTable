import type { ReactNode } from "react";
import { LeagueTable } from "@/components/league-table";
import { ZoneLegend } from "@/components/zone-legend";
import { tablesOf, type Division } from "@/lib/divisions";
import type { Team, Zones } from "@/lib/leagues";

// A full order shown as its tables: one for most leagues, and one per conference for the rest. A team
// missing from the season can't appear in a saved table.
export function LeagueTables({
  order,
  teams,
  divisions,
  zones,
  aside,
}: {
  order: string[];
  teams: Team[];
  divisions: Division[];
  zones: Zones;
  aside?: (team: Team, position: number) => ReactNode;
}) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return (
    <div className="flex flex-col gap-4">
      {tablesOf(order, teams, divisions).map(({ division, order: tableOrder }) => {
        const rows = tableOrder.map((id) => byId.get(id)).filter((team) => team !== undefined);
        return (
          <section key={division?.id ?? "table"} aria-label={division?.name}>
            {division && <h3 className="poster mb-2 text-2xl">{division.name}</h3>}
            <ZoneLegend zones={zones} total={rows.length} />
            <LeagueTable teams={rows} zones={zones} aside={aside} />
          </section>
        );
      })}
    </div>
  );
}
