import type { LeagueRow } from "@/lib/leagues";

type ScoringLeague = Pick<
  LeagueRow,
  | "team_count"
  | "promotion_count"
  | "playoff_from"
  | "relegation_count"
  | "promotion_label"
  | "playoff_label"
  | "relegation_label"
>;

export function ScoringNote({ league }: { league: ScoringLeague }) {
  const bonuses = ["+10 for first place"];
  if (league.promotion_count > 0) bonuses.push(`+5 per team in the ${league.promotion_label} zone`);
  if (league.relegation_count > 0) bonuses.push(`+5 per team in the ${league.relegation_label} zone`);
  if (league.playoff_from !== null) bonuses.push(`+3 per team in the ${league.playoff_label} zone`);
  return (
    <details className="text-sm text-muted">
      <summary className="cursor-pointer py-2 font-semibold">How scoring works</summary>
      <p>
        Each team earns {league.team_count} points, minus one for every place you were off. Bonuses:{" "}
        {bonuses.join(", ")}. A zone bonus counts when you put a team in the right zone, whatever its
        exact place. Level players are split by exact picks.
      </p>
    </details>
  );
}
