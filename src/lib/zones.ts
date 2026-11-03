import type { Zones } from "@/lib/leagues";

export type Zone = "promotion" | "playoff" | "relegation" | null;

export const zoneStyles: Record<NonNullable<Zone>, string> = {
  promotion: "bg-promotion/15 text-promotion",
  playoff: "bg-playoff/15 text-playoff",
  relegation: "bg-relegation/15 text-relegation",
};

export function zoneFor(position: number, total: number, zones: Zones): Zone {
  if (position <= zones.promotion) return "promotion";
  if (
    zones.playoffFrom !== null &&
    zones.playoffTo !== null &&
    position >= zones.playoffFrom &&
    position <= zones.playoffTo
  ) {
    return "playoff";
  }
  if (position > total - zones.relegation) return "relegation";
  return null;
}

export function zoneLabels(zones: Zones) {
  return {
    promotion: zones.promotionLabel ?? "Promoted",
    playoff: zones.playoffLabel ?? "Playoffs",
    relegation: zones.relegationLabel ?? "Relegated",
  };
}

// Reads a zone as words, for places where no table exists yet.
export function describeZones(zones: Zones): string[] {
  const labels = zoneLabels(zones);
  const lines: string[] = [];
  if (zones.promotion > 0) lines.push(`Top ${zones.promotion}: ${labels.promotion}`);
  if (zones.playoffFrom !== null && zones.playoffTo !== null) {
    const places =
      zones.playoffFrom === 1
        ? `Top ${zones.playoffTo}`
        : zones.playoffFrom === zones.playoffTo
          ? `Place ${zones.playoffFrom}`
          : `Places ${zones.playoffFrom}–${zones.playoffTo}`;
    lines.push(`${places}: ${labels.playoff}`);
  }
  if (zones.relegation > 0) lines.push(`Bottom ${zones.relegation}: ${labels.relegation}`);
  return lines;
}
