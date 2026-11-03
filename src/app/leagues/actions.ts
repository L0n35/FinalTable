"use server";

import { revalidatePath } from "next/cache";
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
  teamCount: number;
  deadline: string;
};

export type TeamInput = {
  id?: string;
  name: string;
  logo_path: string | null;
  colour_primary: string;
  colour_secondary: string;
};

const MESSAGES: Record<string, string> = {
  league_limit_reached: "You've reached the limit of 5 new leagues a day. Please try again tomorrow.",
  deadline_must_be_in_the_future: "The start date needs to be in the future.",
  only_admins_can_create_host_leagues: "Only admins can create host leagues.",
  only_admins_can_manage_host_leagues: "Only admins can manage host leagues.",
  league_locked_after_deadline: "This league has started, so its setup is locked.",
  league_not_found: "We couldn't find that league, or you can't change it.",
  league_already_published: "This league is already published.",
  team_count_must_match_teams: "Add a name for every team before publishing.",
  team_count_out_of_range: "A league needs between 4 and 40 teams.",
  duplicate_team_name: "Each team needs a different name.",
  invalid_teams: "Something about those teams wasn't valid. Please check and try again.",
  not_authenticated: "Please sign in first.",
  zones_fit: "Promotion and relegation overlap. Please check the format step.",
  playoff_between_zones: "Playoff places overlap with other zones. Please check the format step.",
  leagues_team_count_check: "A league needs between 4 and 40 teams.",
};

function failure(error: { message?: string } | null): Failure {
  const message = error?.message ?? "";
  const known = Object.keys(MESSAGES).find((key) => message.includes(key));
  if (known) return { ok: false, error: MESSAGES[known] };
  console.error("League action failed:", message);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const basicsRow = (input: BasicsInput) => ({
  name: input.name.trim(),
  type: input.type,
  sport: input.sport.trim() || null,
  deadline: input.deadline,
});

export async function createLeague(input: BasicsInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leagues")
    .insert({ ...basicsRow(input), team_count: input.teamCount })
    .select("id")
    .single();
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

export async function updateBasics(
  leagueId: string,
  input: BasicsInput,
): Promise<Result<{ league: LeagueRow }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leagues")
    .update(basicsRow(input))
    .eq("id", leagueId)
    .select(LEAGUE_COLUMNS)
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return failure({ message: "league_not_found" });
  revalidatePath("/", "layout");
  return { ok: true, league: data as unknown as LeagueRow };
}

export async function saveFormat(
  leagueId: string,
  zones: Zones,
): Promise<Result<{ league: LeagueRow }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leagues")
    .update({
      promotion_count: zones.promotion,
      playoff_from: zones.playoffFrom,
      playoff_to: zones.playoffTo,
      relegation_count: zones.relegation,
    })
    .eq("id", leagueId)
    .select(LEAGUE_COLUMNS)
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return failure({ message: "league_not_found" });
  revalidatePath("/", "layout");
  return { ok: true, league: data as unknown as LeagueRow };
}

export async function saveTeams(
  leagueId: string,
  teamCount: number,
  teams: TeamInput[],
): Promise<Result<{ league: LeagueRow; teams: TeamRow[] }>> {
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("teams")
    .select("logo_path")
    .eq("league_id", leagueId);

  const { error } = await supabase.rpc("save_league_teams", {
    p_league_id: leagueId,
    p_team_count: teamCount,
    p_teams: teams,
  });
  if (error) return failure(error);

  // Clean up replaced logos. A failure here only leaves an unused file behind.
  const inUse = new Set(teams.map((team) => team.logo_path));
  const unused = (before ?? [])
    .map((row) => row.logo_path as string | null)
    .filter((path): path is string => Boolean(path) && !inUse.has(path));
  if (unused.length > 0) await supabase.storage.from("team-logos").remove(unused);

  const [leagueResult, teamsResult] = await Promise.all([
    supabase.from("leagues").select(LEAGUE_COLUMNS).eq("id", leagueId).single(),
    supabase.from("teams").select(TEAM_COLUMNS).eq("league_id", leagueId).order("created_at"),
  ]);
  if (leagueResult.error) return failure(leagueResult.error);
  if (teamsResult.error) return failure(teamsResult.error);
  revalidatePath("/", "layout");
  return {
    ok: true,
    league: leagueResult.data as unknown as LeagueRow,
    teams: teamsResult.data as TeamRow[],
  };
}

export async function publishLeague(leagueId: string): Promise<Result<{ slug: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_league", { p_league_id: leagueId });
  if (error) return failure(error);
  const { data, error: readError } = await supabase
    .from("leagues")
    .select("slug")
    .eq("id", leagueId)
    .single();
  if (readError) return failure(readError);
  revalidatePath("/", "layout");
  return { ok: true, slug: data.slug };
}

export async function deleteLeague(leagueId: string): Promise<Result<object>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leagues")
    .delete()
    .eq("id", leagueId)
    .select("id");
  if (error) return failure(error);
  if (!data || data.length === 0) return failure({ message: "league_not_found" });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function joinLeague(
  leagueId: string,
  joinCode?: string,
): Promise<Result<{ role: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league", {
    p_league_id: leagueId,
    p_join_code: joinCode ?? null,
  });
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return { ok: true, role: data as string };
}

export async function rotateJoinCode(leagueId: string): Promise<Result<{ code: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotate_join_code", { p_league_id: leagueId });
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return { ok: true, code: data as string };
}
