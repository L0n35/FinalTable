import type { Zones } from "@/lib/leagues";

export function ZoneLegend({ zones, total }: { zones: Zones; total: number }) {
  const { promotion, playoffFrom, playoffTo, relegation } = zones;
  if (promotion === 0 && playoffFrom === null && relegation === 0) return null;

  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {promotion > 0 && (
        <li>
          <span className="text-promotion">■</span> Promoted 1–{promotion}
        </li>
      )}
      {playoffFrom !== null && playoffTo !== null && (
        <li>
          <span className="text-playoff">■</span> Playoffs {playoffFrom}–{playoffTo}
        </li>
      )}
      {relegation > 0 && (
        <li>
          <span className="text-relegation">■</span> Relegated {total - relegation + 1}–{total}
        </li>
      )}
    </ul>
  );
}
