import { TeamBadge } from "@/components/team-badge";
import type { Team } from "@/lib/leagues";

// The teams before a table exists. No positions or zone colours, because nobody has finished anywhere yet.
export function TeamGrid({ teams }: { teams: Team[] }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
      {teams.map((team) => (
        <li key={team.id} className="flex h-12 items-center gap-2 rounded-lg border border-line bg-surface px-2">
          <TeamBadge team={team} />
          <span className="min-w-0 truncate text-sm font-medium">{team.name}</span>
        </li>
      ))}
    </ul>
  );
}
