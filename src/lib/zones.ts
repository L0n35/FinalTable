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
