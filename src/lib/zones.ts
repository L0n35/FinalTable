import type { Zones } from "@/lib/demo-league";

export type Zone = "promotion" | "playoff" | "relegation" | null;

export function zoneFor(position: number, total: number, zones: Zones): Zone {
  if (position <= zones.promotion) return "promotion";
  if (position >= zones.playoffFrom && position <= zones.playoffTo) return "playoff";
  if (position > total - zones.relegation) return "relegation";
  return null;
}
