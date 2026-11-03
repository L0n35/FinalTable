import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { LeagueTable } from "@/components/league-table";
import { LocalTime } from "@/components/local-time";
import { PageFallback, PageShell } from "@/components/page-shell";
import { SharePanel } from "@/components/share-panel";
import { ZoneLegend } from "@/components/zone-legend";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import {
  isLocked,
  LEAGUE_COLUMNS,
  TEAM_COLUMNS,
  toTeam,
  zonesOf,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";

export const metadata: Metadata = { title: "League | Final Table" };

async function League({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const { supabase, userId } = session;

  const { data } = await supabase
    .from("leagues")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) notFound();

  const [{ data: teamRows }, membership, ownPrediction, isAdmin] = await Promise.all([
    supabase.from("teams").select(TEAM_COLUMNS).eq("league_id", league.id),
    userId
      ? supabase
          .from("memberships")
          .select("role")
          .eq("league_id", league.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase
          .from("predictions")
          .select("team_order, needs_review")
          .eq("league_id", league.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isCurrentUserAdmin(session),
  ]);

  const teams = ((teamRows ?? []) as TeamRow[])
    .map(toTeam)
    .sort((a, b) => a.name.localeCompare(b.name));
  const role = membership.data?.role as string | undefined;
  const isCreator = userId !== null && league.created_by === userId;
  const canManage = isCreator || isAdmin;
  const locked = isLocked(league);
  const isDraft = league.status === "draft";
  const prediction = ownPrediction.data as { team_order: string[]; needs_review: boolean } | null;
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const predictedTeams = (prediction?.needs_review ? [] : (prediction?.team_order ?? []))
    .map((id) => teamsById.get(id))
    .filter((team) => team !== undefined);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-muted capitalize">
          {league.type} league{league.sport ? ` · ${league.sport}` : ""}
          {isDraft ? " · Draft" : ""}
        </p>
        <h1 className="font-display text-4xl font-bold">{league.name}</h1>
        <p className="mt-1 text-muted">
          {locked ? "Started " : "Predictions lock "}
          <LocalTime iso={league.deadline} />
        </p>
      </div>

      {isDraft ? (
        <Link
          href={`/leagues/${league.id}/setup?step=teams`}
          className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
        >
          Continue setup
        </Link>
      ) : !userId ? (
        <Link
          href={`/login?next=${encodeURIComponent(`/leagues/${league.slug}`)}`}
          className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
        >
          {locked ? "Sign in to follow" : "Sign in to join"}
        </Link>
      ) : !role ? (
        <JoinButton
          leagueId={league.id}
          slug={league.slug}
          label={locked ? "Follow this league" : "Join this league"}
        />
      ) : role === "player" && !locked ? (
        <Link
          href={`/leagues/${league.slug}/predict`}
          className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
        >
          {prediction?.needs_review
            ? "Review your prediction"
            : prediction
              ? "Edit your prediction"
              : "Make your prediction"}
        </Link>
      ) : (
        <p className="rounded-lg border border-line bg-surface p-3">
          {role === "spectator"
            ? "You're following this league as a spectator."
            : predictedTeams.length > 0
              ? "This league has started, and your prediction is locked in."
              : "This league has started, and you didn't get a prediction in."}
        </p>
      )}

      {role === "player" && locked && predictedTeams.length > 0 && (
        <section aria-label="Your prediction">
          <h2 className="mb-2 font-display text-xl font-bold">Your prediction</h2>
          <LeagueTable teams={predictedTeams} zones={zonesOf(league)} />
        </section>
      )}

      {!isDraft && (canManage || role || league.type !== "private") && (
        <SharePanel
          leagueId={league.id}
          leagueName={league.name}
          joinCode={league.join_code}
          canRotate={canManage}
        />
      )}

      {canManage && !isDraft && !locked && (
        <Link
          href={`/leagues/${league.id}/setup?step=teams`}
          className="flex h-12 items-center justify-center rounded-lg border border-line font-semibold"
        >
          Edit league
        </Link>
      )}

      <section aria-label="Teams">
        <h2 className="mb-2 font-display text-xl font-bold">{teams.length} teams</h2>
        <ZoneLegend zones={zonesOf(league)} total={teams.length} />
        <LeagueTable teams={teams} zones={zonesOf(league)} />
      </section>
    </div>
  );
}

export default function LeaguePage({ params }: PageProps<"/leagues/[slug]">) {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <League params={params} />
      </Suspense>
    </PageShell>
  );
}
