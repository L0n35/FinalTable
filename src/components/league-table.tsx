import { TeamBadge } from "@/components/team-badge";
import type { Team, Zones } from "@/lib/leagues";
import { zoneFor, zoneStyles } from "@/lib/zones";

// A read-only table with zones tied to positions, matching the prediction screen.
export function LeagueTable({ teams, zones }: { teams: Team[]; zones: Zones }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {teams.map((team, index) => {
        const zone = zoneFor(index + 1, teams.length, zones);
        return (
          <li
            key={team.id}
            className={`flex h-14 items-center rounded-lg ${zone ? zoneStyles[zone] : "text-muted"}`}
          >
            <span className="w-10 shrink-0 text-center font-display text-xl font-bold tabular-nums">
              {index + 1}
            </span>
            <div className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-surface pl-3 text-foreground">
              <TeamBadge team={team} />
              <span className="truncate pr-3 font-medium">{team.name}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
