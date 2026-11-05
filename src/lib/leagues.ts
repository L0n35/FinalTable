import type { CSSProperties } from "react";
import { supabaseUrl } from "@/lib/supabase/config";

export type LeagueType = "official" | "public" | "private";

// A row of the league_details view: a league together with the season it plays.
export type LeagueRow = {
  id: string;
  slug: string;
  join_code: string;
  type: LeagueType;
  name: string;
  created_by: string | null;
  hidden_at: string | null;
  season_id: string;
  team_count: number;
  deadline: string;
  promotion_count: number;
  playoff_from: number | null;
  playoff_to: number | null;
  relegation_count: number;
  status: "draft" | "published" | "finished";
  competition_id: string | null;
  competition_name: string | null;
  season_label: string | null;
  sport: string | null;
  promotion_label: string;
  playoff_label: string;
  relegation_label: string;
  competition_accent: string | null;
};

export type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_path: string | null;
  colour_primary: string;
  colour_secondary: string;
  division_id?: string | null;
};

// A row of league_leaderboard. Points and ranks are empty until the first standings update.
export type BoardRow = {
  user_id: string;
  display_name: string;
  base_points: number | null;
  bonus_points: number | null;
  total_points: number | null;
  exact_count: number | null;
  rank: number | null;
  previous_rank: number | null;
  entry_count: number;
};

export type Team = {
  id: string;
  name: string;
  initials: string;
  primary: string;
  secondary: string;
  logoUrl?: string | null;
  divisionId?: string | null;
};

export type Zones = {
  promotion: number;
  playoffFrom: number | null;
  playoffTo: number | null;
  relegation: number;
  // Words for each zone, such as "Champions League" or "Finals". Left out, the defaults apply.
  promotionLabel?: string;
  playoffLabel?: string;
  relegationLabel?: string;
};

export const LEAGUE_COLUMNS =
  "id, slug, join_code, type, name, created_by, hidden_at, season_id, team_count, deadline, promotion_count, playoff_from, playoff_to, relegation_count, status, competition_id, competition_name, season_label, sport, promotion_label, playoff_label, relegation_label, competition_accent";
export const TEAM_COLUMNS = "id, name, short_name, logo_path, colour_primary, colour_secondary, division_id";

export const MIN_TEAMS = 4;
export const MAX_TEAMS = 40;

// Colour pairs with readable contrast, handed out in turn to new teams.
export const BADGE_COLOURS: [string, string][] = [
  ["#14508c", "#ffffff"],
  ["#b3202a", "#ffffff"],
  ["#f2c230", "#1c1c1c"],
  ["#14613a", "#ffffff"],
  ["#4b2a7b", "#f0e6ff"],
  ["#e86a17", "#1c1c1c"],
  ["#0f7c7c", "#ffffff"],
  ["#7cc4ee", "#10283d"],
  ["#7a1f2b", "#f5d76e"],
  ["#ffffff", "#1b3f8f"],
  ["#3a3f45", "#f2c230"],
  ["#c2185b", "#ffffff"],
];

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function logoUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/team-logos/${path}`;
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    initials: row.short_name ?? initialsFor(row.name),
    primary: row.colour_primary,
    secondary: row.colour_secondary,
    logoUrl: row.logo_path ? logoUrl(row.logo_path) : null,
    divisionId: row.division_id ?? null,
  };
}

export function zonesOf(league: LeagueRow): Zones {
  return {
    promotion: league.promotion_count,
    playoffFrom: league.playoff_from,
    playoffTo: league.playoff_to,
    relegation: league.relegation_count,
    promotionLabel: league.promotion_label,
    playoffLabel: league.playoff_label,
    relegationLabel: league.relegation_label,
  };
}

// Everything is a league in the database. On screen, a group is friends playing a real league together.
// Someone running their own competition, with their own teams and table, is running a league.
export function leagueNoun(league: Pick<LeagueRow, "type" | "competition_id">): "league" | "group" {
  return isPresetLeague(league) ? "group" : "league";
}

// "Official" beside a real league's name would read as if that league endorses it.
export function leagueTypeLabel(league: Pick<LeagueRow, "type" | "competition_id">): string {
  if (league.type === "official") return "Global league";
  return `${league.type === "public" ? "Public" : "Private"} ${leagueNoun(league)}`;
}

// MLS East and West became one league, so their old links lead to it. These have a random ending.
export function mergedLeagueSlug(slug: string): string | null {
  return /^mls-(east|west)-2027-sprint-/.test(slug) ? "mls-2027-sprint" : null;
}

export type StartKind = "preset" | "custom" | "official";

// What a link to the create page asked to start. Only admins can start an official league.
export function readStartKind(kind: unknown, isAdmin: boolean): StartKind | null {
  if (kind === "preset" || kind === "custom") return kind;
  return kind === "official" && isAdmin ? "official" : null;
}

// Sets the colour for the league-card family of styles. Without one, they fall back to their default.
export function accentStyle(accent: string | null | undefined): CSSProperties | undefined {
  return accent ? ({ "--league": accent } as CSSProperties) : undefined;
}

export type Surface = "football" | "court" | "cricket" | "aussie-rules" | "rugby" | "track" | "plain";

const SURFACES: Record<string, Surface> = {
  football: "football",
  soccer: "football",
  basketball: "court",
  cricket: "cricket",
  "aussie rules": "aussie-rules",
  "australian rules": "aussie-rules",
  rugby: "rugby",
  "rugby league": "rugby",
  "rugby union": "rugby",
  motorsport: "track",
  "formula 1": "track",
  f1: "track",
  motogp: "track",
  indycar: "track",
  nascar: "track",
};

// The ground a league plays on. People running their own league can type any sport, so anything else gets a plain one.
export function surfaceFor(sport: string | null | undefined): Surface {
  return SURFACES[(sport ?? "").trim().toLowerCase()] ?? "plain";
}

// Offered when someone sets up their own league, so choosing one gets them that sport's ground.
export const SPORT_OPTIONS = [
  "Football",
  "Basketball",
  "Cricket",
  "Aussie rules",
  "Rugby league",
  "Rugby union",
  "Motorsport",
];

// The listed spelling of a sport, or null if it's something the creator typed themselves.
export function listedSport(sport: string): string | null {
  const wanted = sport.trim().toLowerCase();
  return SPORT_OPTIONS.find((option) => option.toLowerCase() === wanted) ?? null;
}

// A league playing an official season that isn't the official league itself.
export function isPresetLeague(league: Pick<LeagueRow, "type" | "competition_id">): boolean {
  return league.type !== "official" && league.competition_id !== null;
}

export function seasonTitle(league: Pick<LeagueRow, "competition_name" | "season_label">): string | null {
  return league.competition_name ? `${league.competition_name} ${league.season_label}` : null;
}

// Mirrors the database constraints, so people see the problem before saving.
export function zoneProblem(zones: Zones, total: number): string | null {
  const { promotion, playoffFrom, playoffTo, relegation } = zones;
  if (promotion + relegation > total) return "Promotion and relegation overlap.";
  if (playoffFrom === null || playoffTo === null) return null;
  if (playoffFrom > playoffTo) return "Playoff places need to run from top to bottom.";
  if (playoffFrom <= promotion) return "Playoff places overlap with promotion.";
  if (playoffTo > total - relegation) return "Playoff places overlap with relegation.";
  return null;
}

// With a time zone, the locale is fixed too, so the server and browser produce identical text.
export function formatDeadline(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(timeZone ? "en-GB" : undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatShortDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(timeZone ? "en-GB" : undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

// Whole days from far out, then hours and minutes for the last 48 hours.
export function timeLeft(deadline: number, now: number): string {
  const minutes = Math.max(0, Math.floor((deadline - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  if (days >= 2) return `${days} days left`;
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}

export function isLocked(league: Pick<LeagueRow, "status" | "deadline">): boolean {
  return league.status !== "draft" && new Date(league.deadline).getTime() <= Date.now();
}

export function ordinal(position: number): string {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;
  return `${position}${["th", "st", "nd", "rd"][position % 10] ?? "th"}`;
}
