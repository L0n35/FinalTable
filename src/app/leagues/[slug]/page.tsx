import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { LeagueTable } from "@/components/league-table";
import { LiveSeason, readLiveView } from "@/components/live-season";
import { LocalTime } from "@/components/local-time";
import { PageFallback, PageShell } from "@/components/page-shell";
import { SharePanel } from "@/components/share-panel";
import { ZoneLegend } from "@/components/zone-legend";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import {
  isLocked,
  isPresetLeague,
  LEAGUE_COLUMNS,
  seasonTitle,
  TEAM_COLUMNS,
  toTeam,
  zonesOf,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";

export const metadata: Metadata = { title: "League | Final Table" };

const TYPE_LABELS = { official: "Official league", public: "Public league", private: "Private league" };

async function League({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[]; player?: string | string[]; page?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const session = await getSession();
  const { supabase, userId } = session;

  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) notFound();

  const [{ data: teamRows }, membership, ownPrediction, isAdmin] = await Promise.all([
    supabase.from("teams").select(TEAM_COLUMNS).eq("season_id", league.season_id),
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
          .eq("season_id", league.season_id)
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
  const isOfficial = league.type === "official";
  const isPreset = isPresetLeague(league);
  const locked = isLocked(league);
  const isDraft = league.status === "draft";
  const isLive = !isDraft && locked;
  const prediction = ownPrediction.data as { team_order: string[]; needs_review: boolean } | null;
  const ownOrder = prediction && !prediction.needs_review ? prediction.team_order : null;
  const title = seasonTitle(league);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-muted">
          {TYPE_LABELS[league.type]}
          {league.sport ? ` · ${league.sport}` : ""}
          {isDraft ? " · Draft" : league.status === "finished" ? " · Finished" : isLive ? " · Live" : ""}
        </p>
        <h1 className="font-display text-4xl font-bold break-words">{league.name}</h1>
        {isPreset && <p className="text-muted">Playing {title}</p>}
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
          label={locked && !prediction ? "Follow this league" : "Join this league"}
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
      ) : role === "spectator" || !ownOrder ? (
        <p className="rounded-lg border border-line bg-surface p-3">
          {role === "spectator"
            ? "You're following this league as a spectator."
            : "This league has started, and you didn't get a prediction in."}
        </p>
      ) : null}

      {title && role === "player" && prediction && !locked && (
        <p className="text-sm text-muted">
          You have one table for {title}, and it counts in every league you&apos;re in for that
          season.
        </p>
      )}

      {isLive && (
        <LiveSeason
          session={session}
          league={league}
          teams={teams}
          ownOrder={role === "player" ? ownOrder : null}
          canUpdate={!isPreset && canManage}
          canReopen={!isPreset && isAdmin}
          view={readLiveView(query)}
        />
      )}

      {!isDraft && (canManage || role || league.type !== "private") && (
        <SharePanel
          leagueId={league.id}
          leagueName={league.name}
          joinCode={league.join_code}
          canRotate={canManage && !isOfficial}
        />
      )}

      {canManage && !isDraft && !locked && (
        <Link
          href={`/leagues/${league.id}/setup?step=${isPreset ? "basics" : "teams"}`}
          className="flex h-12 items-center justify-center rounded-lg border border-line font-semibold"
        >
          {isPreset ? "League settings" : "Edit league"}
        </Link>
      )}

      {!isLive && (
        <section aria-label="Teams">
          <h2 className="mb-2 font-display text-xl font-bold">{teams.length} teams</h2>
          {isPreset && (
            <p className="mb-2 text-sm text-muted">
              Teams and standings update automatically from the official league.
            </p>
          )}
          <ZoneLegend zones={zonesOf(league)} total={teams.length} />
          <LeagueTable teams={teams} zones={zonesOf(league)} />
        </section>
      )}
    </div>
  );
}

export default function LeaguePage({ params, searchParams }: PageProps<"/leagues/[slug]">) {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <League params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
