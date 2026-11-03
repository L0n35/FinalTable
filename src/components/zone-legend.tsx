import type { Zones } from "@/lib/leagues";
import { zoneLabels } from "@/lib/zones";

const places = (from: number, to: number) => (from === to ? String(from) : `${from}–${to}`);

export function ZoneLegend({ zones, total }: { zones: Zones; total: number }) {
  const { promotion, playoffFrom, playoffTo, relegation } = zones;
  const labels = zoneLabels(zones);
  if (promotion === 0 && playoffFrom === null && relegation === 0) return null;

  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {promotion > 0 && (
        <li>
          <span className="text-promotion">■</span> {labels.promotion} {places(1, promotion)}
        </li>
      )}
      {playoffFrom !== null && playoffTo !== null && (
        <li>
          <span className="text-playoff">■</span> {labels.playoff} {places(playoffFrom, playoffTo)}
        </li>
      )}
      {relegation > 0 && (
        <li>
          <span className="text-relegation">■</span> {labels.relegation} {places(total - relegation + 1, total)}
        </li>
      )}
    </ul>
  );
}
