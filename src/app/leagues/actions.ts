"use server";

import { refresh, updateTag } from "next/cache";
import { DIRECTORY_TAG } from "@/lib/directory";
import {
  LEAGUE_COLUMNS,
  TEAM_COLUMNS,
  type LeagueRow,
  type LeagueType,
  type TeamRow,
  type Zones,
} from "@/lib/leagues";
import { createClient } from "@/lib/supabase/server";

type Failure = { ok: false; error: string };
type Result<T> = ({ ok: true } & T) | Failure;

export type BasicsInput = {
  name: string;
  type: LeagueType;
  sport: string;
  deadline: string;
};

export type CustomLeagueInput = BasicsInput & { teamCount: number };

export type OfficialSeasonInput = {
  sport: string;
  competition: string;
  label: string;
  teamCount: number;
  deadline: string;
  copyFrom: string | null;
};

export type TeamInput = {
  id?: string;
  name: string;
  logo_path: string | null;
  colour_primary: string;
  colour_secondary: string;
};

const MESSAGES: Record<string, string> = {
  league_limit_reached: "You've reached the limit of 5 new leagues and groups a day. Please try again tomorrow.",
  deadline_must_be_in_the_future: "The lock time needs to be in the future.",
  official_leagues_need_a_competition: "That type isn't available here.",
  admin_only: "Only admins can do that.",
  preset_not_available: "That league has already started, or is no longer available.",
  season_already_exists: "That competition already has a season with that name.",
  season_to_copy_not_found: "We couldn't find the season to copy. Please try again.",
  season_has_other_leagues: "Other groups are using this season, so it can't be deleted. You can hide it instead.",
  league_locked_after_deadline: "This has started, so its setup is locked.",
  league_not_found: "We couldn't find that, or you can't change it.",
  league_already_published: "This is already published.",
  team_count_must_match_teams: "Add a name for every team before publishing.",
  team_count_out_of_range: "A table needs between 4 and 40 teams.",
  duplicate_team_name: "Each team needs a different name.",
  invalid_teams: "Something about those teams wasn't valid. Please check and try again.",
  not_authenticated: "Please sign in first.",
  deadline_passed: "Predictions have closed.",
  league_not_open: "This isn't open for predictions.",
  not_a_player: "Only players can submit a prediction.",
  invalid_team_order: "The teams have changed. Please reload and check your table.",
  league_not_live: "This season isn't live, so its standings can't change.",
  deadline_not_reached: "Standings can be updated once predictions have locked.",
  no_standings_yet: "Update the standings at least once before finishing the season.",
  one_open_report: "You've already reported this, and an admin will take a look.",
  report_limit_reached: "You've sent a lot of reports today. Please try again tomorrow.",
  zones_fit: "Promotion and relegation overlap. Please check the format step.",
  playoff_between_zones: "Playoff places overlap with other zones. Please check the format step.",
  seasons_team_count_check: "A table needs between 4 and 40 teams.",
};

function failure(error: { message?: string } | null): Failure {
  const message = error?.message ?? "";
  const known = Object.keys(MESSAGES).find((key) => message.includes(key));
  if (known) return { ok: false, error: MESSAGES[known] };
  console.error("League action failed:", message);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// Home and Explore are cached for everyone, so only a change to what they list clears them. Anything
// else, such as joining or predicting, just refreshes the player's own screen.
const refreshListings = () => updateTag(DIRECTORY_TAG);

async function readLeague(supabase: Awaited<ReturnType<typeof createClient>>, leagueId: string) {
  const { data, error } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("id", leagueId)
    .single();
  return { league: data as unknown as LeagueRow | null, error };
}

// Deletes logo files, unless a copied season still uses them. A failure here only leaves an unused
// file behind.
async function removeUnusedLogos(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  if (paths.length === 0) return;
  const { data: stillUsed } = await supabase.from("teams").select("logo_path").in("logo_path", paths);
  const shared = new Set((stillUsed ?? []).map((row) => row.logo_path as string));
  const removable = paths.filter((path) => !shared.has(path));
  if (removable.length > 0) await supabase.storage.from("team-logos").remove(removable);
}

export async function createCustomLeague(input: CustomLeagueInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_custom_league", {
    p_name: input.name,
    p_type: input.type,
    p_sport: input.sport,
    p_team_count: input.teamCount,
    p_deadline: input.deadline,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, id: data as string };
}

export async function createPresetLeague(
  seasonId: string,
  name: string,
  type: LeagueType,
): Promise<Result<{ slug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_preset_league", {
    p_season_id: seasonId,
    p_name: name,
    p_type: type,
  });
  if (error) return failure(error);
  const { league, error: readError } = await readLeague(supabase, data as string);
  if (readError || !league) return failure(readError);
  if (type === "public") refreshListings();
  else refresh();
  return { ok: true, slug: league.slug };
}

export async function createOfficialSeason(input: OfficialSeasonInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_official_season", {
    p_sport: input.sport,
    p_competition: input.competition,
    p_label: input.label,
    p_team_count: input.teamCount,
    p_deadline: input.deadline,
    p_copy_from: input.copyFrom,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, id: data as string };
}

export async function updateBasics(
  leagueId: string,
  input: BasicsInput,
): Promise<Result<{ league: LeagueRow }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_league_basics", {
    p_league_id: leagueId,
    p_name: input.name,
    p_type: input.type,
    p_sport: input.sport,
    p_deadline: input.deadline,
  });
  if (error) return failure(error);
  const { league, error: readError } = await readLeague(supabase, leagueId);
  if (readError || !league) return failure(readError);
  refreshListings();
  return { ok: true, league };
}

export async function saveFormat(
  league: Pick<LeagueRow, "id" | "season_id">,
  zones: Zones,
): Promise<Result<{ league: LeagueRow }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_season_format", {
    p_season_id: league.season_id,
    p_promotion: zones.promotion,
    p_playoff_from: zones.playoffFrom,
    p_playoff_to: zones.playoffTo,
    p_relegation: zones.relegation,
  });
  if (error) return failure(error);
  const { league: saved, error: readError } = await readLeague(supabase, league.id);
  if (readError || !saved) return failure(readError);
  refresh();
  return { ok: true, league: saved };
}

export async function saveTeams(
  league: Pick<LeagueRow, "id" | "season_id">,
  teamCount: number,
  teams: TeamInput[],
): Promise<Result<{ league: LeagueRow; teams: TeamRow[] }>> {
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("teams")
    .select("logo_path")
    .eq("season_id", league.season_id);

  const { error } = await supabase.rpc("save_season_teams", {
    p_season_id: league.season_id,
    p_team_count: teamCount,
    p_teams: teams,
  });
  if (error) return failure(error);

  const inUse = new Set(teams.map((team) => team.logo_path));
  await removeUnusedLogos(
    supabase,
    (before ?? [])
      .map((row) => row.logo_path as string | null)
      .filter((path): path is string => Boolean(path) && !inUse.has(path)),
  );

  const [{ league: saved, error: readError }, teamsResult] = await Promise.all([
    readLeague(supabase, league.id),
    supabase.from("teams").select(TEAM_COLUMNS).eq("season_id", league.season_id).order("created_at"),
  ]);
  if (readError || !saved) return failure(readError);
  if (teamsResult.error) return failure(teamsResult.error);
  if (saved.type === "official") refreshListings();
  else refresh();
  return { ok: true, league: saved, teams: teamsResult.data as TeamRow[] };
}

export async function publishSeason(
  league: Pick<LeagueRow, "season_id" | "slug">,
): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_season", { p_season_id: league.season_id });
  if (error) return failure(error);
  refreshListings();
  return { ok: true };
}

export async function deleteLeague(leagueId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { league } = await readLeague(supabase, leagueId);
  const { data: before } = league
    ? await supabase.from("teams").select("logo_path").eq("season_id", league.season_id)
    : { data: null };
  const { error } = await supabase.rpc("delete_league", { p_league_id: leagueId });
  if (error) return failure(error);
  await removeUnusedLogos(
    supabase,
    (before ?? []).map((row) => row.logo_path as string | null).filter((path): path is string => Boolean(path)),
  );
  refreshListings();
  return { ok: true };
}

export async function joinLeague(
  leagueId: string,
  joinCode?: string,
): Promise<Result<{ role: string; hasPrediction: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league", {
    p_league_id: leagueId,
    p_join_code: joinCode ?? null,
  });
  if (error) return failure(error);

  // One table counts in every league on a season, so someone who has one needn't predict again.
  const { league } = await readLeague(supabase, leagueId);
  const { data: userData } = await supabase.auth.getClaims();
  const { data: prediction } = league
    ? await supabase
        .from("predictions")
        .select("id")
        .eq("season_id", league.season_id)
        .eq("user_id", userData?.claims.sub ?? "")
        .maybeSingle()
    : { data: null };

  refresh();
  return { ok: true, role: data as string, hasPrediction: Boolean(prediction) };
}

export async function submitPrediction(
  seasonId: string,
  order: string[],
): Promise<{ ok: true } | { ok: false; error: string; closed?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_prediction", {
    p_season_id: seasonId,
    p_team_order: order,
  });
  if (error) {
    return { ...failure(error), closed: error.message.includes("deadline_passed") };
  }
  refresh();
  return { ok: true };
}

export async function rotateJoinCode(leagueId: string): Promise<Result<{ code: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotate_join_code", { p_league_id: leagueId });
  if (error) return failure(error);
  refresh();
  return { ok: true, code: data as string };
}

export async function updateStandings(seasonId: string, order: string[]): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_standings", {
    p_season_id: seasonId,
    p_team_order: order,
  });
  if (error) return failure(error);
  refreshListings();
  return { ok: true };
}

export async function finishSeason(seasonId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_season", { p_season_id: seasonId });
  if (error) return failure(error);
  refreshListings();
  return { ok: true };
}

export async function reopenSeason(seasonId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_season", { p_season_id: seasonId });
  if (error) return failure(error);
  refreshListings();
  return { ok: true };
}

export async function submitReport(
  leagueId: string,
  teamId: string | null,
  reason: string,
): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .insert({ league_id: leagueId, team_id: teamId, reason: reason.trim() });
  if (error) return failure(error);
  return { ok: true };
}

export async function dismissReport(reportId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_report", { p_report_id: reportId });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

export async function resolveReports(leagueId: string, hide: boolean): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_league_reports", { p_league_id: leagueId, p_hide: hide });
  if (error) return failure(error);
  if (hide) refreshListings();
  else refresh();
  return { ok: true };
}

export async function setLeagueHidden(leagueId: string, hidden: boolean): Promise<Result<object>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_league_hidden", { p_league_id: leagueId, p_hidden: hidden });
  if (error) return failure(error);
  refreshListings();
  return { ok: true };
}

export async function removeTeamLogo(teamId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_team_logo", { p_team_id: teamId });
  if (error) return failure(error);
  await removeUnusedLogos(supabase, data ? [data as string] : []);
  refreshListings();
  return { ok: true };
}
