import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { submitPrediction } from "@/app/leagues/actions";
import { PageFallback } from "@/components/page-fallback";
import { PageShell } from "@/components/page-shell";
import { PredictionLoader } from "@/components/prediction-loader";
import { getSession } from "@/lib/auth";
import { DIVISION_COLUMNS, type Division } from "@/lib/divisions";
import {
  isLocked,
  LEAGUE_COLUMNS,
  seasonTitle,
  TEAM_COLUMNS,
  toTeam,
  zonesOf,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";

export const metadata: Metadata = { title: "Your prediction | Final Table" };

async function Predict({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const leaguePath = `/leagues/${slug}`;
  const { supabase, userId } = await getSession();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`${leaguePath}/predict`)}`);

  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) notFound();
  if (league.status !== "published" || isLocked(league)) redirect(leaguePath);

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("league_id", league.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.role !== "player") redirect(leaguePath);

  const [{ data: teams }, { data: divisions }, { data: prediction }] = await Promise.all([
    supabase.from("teams").select(TEAM_COLUMNS).eq("season_id", league.season_id),
    supabase.from("divisions").select(DIVISION_COLUMNS).eq("season_id", league.season_id).order("position"),
    supabase
      .from("predictions")
      .select("team_order, needs_review, submitted_at")
      .eq("season_id", league.season_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const title = seasonTitle(league);

  return (
    <PredictionLoader
      league={{
        // Predictions belong to the season, so that's what the screen saves and keeps drafts under.
        id: league.season_id,
        name: league.name,
        deadline: league.deadline,
        zones: zonesOf(league),
        teams: ((teams ?? []) as TeamRow[]).map(toTeam),
        divisions: (divisions ?? []) as Division[],
      }}
      save={submitPrediction}
      initialSubmitted={(prediction?.team_order as string[] | undefined) ?? null}
      submittedAt={(prediction?.submitted_at as string | undefined) ?? null}
      needsReview={prediction?.needs_review === true}
      userId={userId}
      backHref={leaguePath}
      sharePath={`/join/${league.join_code}`}
      calendarHref={`${leaguePath}/calendar`}
      note={title ? `This table counts in every ${title} league you're in.` : undefined}
    />
  );
}

export default function PredictPage({ params }: PageProps<"/leagues/[slug]/predict">) {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageFallback />
        </PageShell>
      }
    >
      <Predict params={params} />
    </Suspense>
  );
}
