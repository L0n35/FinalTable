import Link from "next/link";
import { JoinedOr } from "@/components/joined-leagues";
import { StatePill } from "@/components/league-card";
import { playerCountLabel, type PublicGroup } from "@/lib/directory-rows";
import { accentStyle } from "@/lib/leagues";

function GroupRow({ group, accent }: { group: PublicGroup; accent?: string }) {
  return (
    <li>
      <Link
        href={`/leagues/${group.slug}`}
        style={accentStyle(accent)}
        className="group-row flex min-h-16 items-center justify-between gap-3 rounded-xl border border-line py-2.5 pr-3 pl-4"
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-tight font-bold">{group.name}</span>
          <span className="block truncate text-sm text-muted">
            {group.competition_name ? `Playing ${group.competition_name}` : (group.sport ?? "Made by players")}
            {" · "}
            {playerCountLabel(group.player_count)}
          </span>
        </span>
        <span className="shrink-0 text-sm">
          <JoinedOr leagueId={group.league_id}>
            <StatePill state={group.state} />
          </JoinedOr>
        </span>
      </Link>
    </li>
  );
}

export function GroupList({
  groups,
  accents,
}: {
  groups: PublicGroup[];
  accents: Map<string, string>;
}) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {groups.map((group) => (
        <GroupRow
          key={group.league_id}
          group={group}
          accent={group.competition_name ? accents.get(group.competition_name) : undefined}
        />
      ))}
    </ul>
  );
}
