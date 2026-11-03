// The public directory's rows and what the home and Explore pages work out from them. Safe to use in
// the browser: reading the rows happens in directory.ts.

export type DirectoryBadge = {
  name: string;
  short_name: string | null;
  logo_path: string | null;
  colour_primary: string;
  colour_secondary: string;
};

// A row of public_directory: a global league, or a competition waiting for its next season.
export type DirectoryRow = {
  competition_id: string;
  competition_name: string;
  sport: string;
  accent: string | null;
  sort_order: number;
  state: "open" | "live" | "finished" | "coming_soon";
  opens_note: string | null;
  league_id: string | null;
  slug: string | null;
  season_id: string | null;
  season_label: string | null;
  team_count: number | null;
  deadline: string | null;
  entrant_count: number | null;
  crowd_team: string | null;
  crowd_percent: number | null;
  leader_name: string | null;
  leader_points: number | null;
  badges: DirectoryBadge[] | null;
};

export type ListedLeague = DirectoryRow & {
  state: "open" | "live" | "finished";
  league_id: string;
  slug: string;
  season_label: string;
  team_count: number;
  deadline: string;
};

// A row of public_groups.
export type PublicGroup = {
  league_id: string;
  slug: string;
  name: string;
  competition_name: string | null;
  sport: string | null;
  team_count: number;
  deadline: string;
  state: "open" | "live" | "finished";
  player_count: number;
};

const MIN_PLAYERS_SHOWN = 10;

const SPORT_ICONS: Record<string, string> = {
  Football: "⚽",
  Basketball: "🏀",
  Cricket: "🏏",
  "Aussie rules": "🏉",
  "Rugby league": "🏉",
};

export function sportIcon(sport: string): string | null {
  return SPORT_ICONS[sport] ?? null;
}

function isListed(row: DirectoryRow): row is ListedLeague {
  return row.state !== "coming_soon";
}

const byDeadline = (a: ListedLeague, b: ListedLeague) =>
  a.deadline.localeCompare(b.deadline) || a.sort_order - b.sort_order;

export function splitDirectory(rows: DirectoryRow[]) {
  const listed = rows.filter(isListed);
  return {
    // Whatever locks soonest comes first, because that's the most urgent.
    open: listed.filter((row) => row.state === "open").sort(byDeadline),
    // The busiest first, where there's the most to look at.
    live: listed
      .filter((row) => row.state === "live")
      .sort((a, b) => (b.entrant_count ?? 0) - (a.entrant_count ?? 0) || a.sort_order - b.sort_order),
    finished: listed.filter((row) => row.state === "finished").sort((a, b) => byDeadline(b, a)),
    comingSoon: rows
      .filter((row) => row.state === "coming_soon")
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

// Sports in the directory's own order, so the biggest leagues set the order of the chips.
export function sportsIn(rows: DirectoryRow[]): string[] {
  return [...new Set([...rows].sort((a, b) => a.sort_order - b.sort_order).map((row) => row.sport))];
}

export function playerCountLine(row: DirectoryRow): string | null {
  return row.entrant_count !== null && row.entrant_count >= MIN_PLAYERS_SHOWN ? `${row.entrant_count} players` : null;
}

export function crowdLine(row: DirectoryRow): string | null {
  if (!row.crowd_team || row.crowd_percent === null) return null;
  return `${row.crowd_percent}% picked ${row.crowd_team} to finish top`;
}

export function leaderLine(row: DirectoryRow): string | null {
  if (!row.leader_name || row.leader_points === null) return null;
  const points = `${row.leader_points} ${row.leader_points === 1 ? "pt" : "pts"}`;
  return `${row.state === "finished" ? "Won by" : "Leading:"} ${row.leader_name} · ${points}`;
}

// A group's competition has no colour of its own in public_groups, so it's matched from the directory.
export function accentsByCompetition(rows: DirectoryRow[]): Map<string, string> {
  return new Map(
    rows.flatMap((row) => (row.accent ? ([[row.competition_name, row.accent]] as [string, string][]) : [])),
  );
}

export function playerCountLabel(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"}`;
}
