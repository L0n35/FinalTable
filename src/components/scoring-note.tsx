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

// tableSizes has one number per conference, and the database does the real scoring.
export function ScoringNote({ league, tableSizes = [] }: { league: ScoringLeague; tableSizes?: number[] }) {
  const isDivided = tableSizes.length > 1;
  const inEach = isDivided ? " in each conference" : "";
  const bonuses = [`+10 for first place${inEach}`];
  if (league.promotion_count > 0) bonuses.push(`+5 per team in the ${league.promotion_label} zone`);
  if (league.relegation_count > 0) bonuses.push(`+5 per team in the ${league.relegation_label} zone`);
  if (league.playoff_from !== null) bonuses.push(`+3 per team in the ${league.playoff_label} zone`);

  const points = isDivided ? (new Set(tableSizes).size === 1 ? tableSizes[0] : null) : league.team_count;
  const perTeam =
    points === null
      ? "Each team earns one point for every team in its conference, minus one for every place you were off."
      : `Each team earns ${points} points, minus one for every place you were off.`;

  return (
    <details className="text-sm text-muted">
      <summary className="cursor-pointer py-2 font-semibold">How scoring works</summary>
      <p>
        {isDivided && "Each conference is scored as its own table, and the points are added up. "}
        {perTeam} Bonuses: {bonuses.join(", ")}. A zone bonus counts when you put a team in the right zone, whatever its
        exact place. Level players are split by exact picks.
      </p>
    </details>
  );
}
