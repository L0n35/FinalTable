import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageFallback } from "@/components/page-fallback";
import { PageShell } from "@/components/page-shell";
import { StandingsLoader } from "@/components/standings-loader";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { DIVISION_COLUMNS, type Division } from "@/lib/divisions";
import {
  isLocked,
  LEAGUE_COLUMNS,
  TEAM_COLUMNS,
  toTeam,
  zonesOf,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";

export const metadata: Metadata = { title: "Update standings | Final Table" };

async function Standings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const leaguePath = `/leagues/${slug}`;
  const session = await getSession();
  const { supabase, userId } = session;
  if (!userId) redirect(`/login?next=${encodeURIComponent(`${leaguePath}/standings`)}`);

  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) notFound();

  const isCreatorOfCustom = league.created_by === userId && league.competition_id === null;
  const canUpdate = isCreatorOfCustom || (await isCurrentUserAdmin(session));
  if (!canUpdate || league.status !== "published" || !isLocked(league)) redirect(leaguePath);

  const [{ data: teams }, { data: divisions }, { data: latest }] = await Promise.all([
    supabase.from("teams").select(TEAM_COLUMNS).eq("season_id", league.season_id),
    supabase.from("divisions").select(DIVISION_COLUMNS).eq("season_id", league.season_id).order("position"),
    supabase
      .from("standings_updates")
      .select("version, team_order")
      .eq("season_id", league.season_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <StandingsLoader
      // Starts afresh from a newer table, including one someone else saved.
      key={(latest?.version as number | undefined) ?? 0}
      seasonId={league.season_id}
      leagueName={league.name}
      leaguePath={leaguePath}
      teams={((teams ?? []) as TeamRow[]).map(toTeam)}
      divisions={(divisions ?? []) as Division[]}
      zones={zonesOf(league)}
      saved={(latest?.team_order as string[] | undefined) ?? null}
      note={
        league.competition_id
          ? "Saving updates scores straight away in every league and group playing this season."
          : "Saving updates everyone's scores straight away."
      }
    />
  );
}

export default function StandingsPage({ params }: PageProps<"/leagues/[slug]/standings">) {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageFallback />
        </PageShell>
      }
    >
      <Standings params={params} />
    </Suspense>
  );
}
