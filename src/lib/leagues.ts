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
};

export type TeamRow = {
  id: string;
  name: string;
  logo_path: string | null;
  colour_primary: string;
  colour_secondary: string;
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
};

export type Zones = {
  promotion: number;
  playoffFrom: number | null;
  playoffTo: number | null;
  relegation: number;
};

export const LEAGUE_COLUMNS =
  "id, slug, join_code, type, name, created_by, hidden_at, season_id, team_count, deadline, promotion_count, playoff_from, playoff_to, relegation_count, status, competition_id, competition_name, season_label, sport";
export const TEAM_COLUMNS = "id, name, logo_path, colour_primary, colour_secondary";

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
    initials: initialsFor(row.name),
    primary: row.colour_primary,
    secondary: row.colour_secondary,
    logoUrl: row.logo_path ? logoUrl(row.logo_path) : null,
  };
}

export function zonesOf(league: LeagueRow): Zones {
  return {
    promotion: league.promotion_count,
    playoffFrom: league.playoff_from,
    playoffTo: league.playoff_to,
    relegation: league.relegation_count,
  };
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

export function isLocked(league: Pick<LeagueRow, "status" | "deadline">): boolean {
  return league.status !== "draft" && new Date(league.deadline).getTime() <= Date.now();
}

export function ordinal(position: number): string {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;
  return `${position}${["th", "st", "nd", "rd"][position % 10] ?? "th"}`;
}
