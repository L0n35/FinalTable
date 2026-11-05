import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { LiveSeason, readLiveView } from "@/components/live-season";
import { LocalTime } from "@/components/local-time";
import { LeagueModeration } from "@/components/moderation-controls";
import { PageFallback } from "@/components/page-fallback";
import { PageShell } from "@/components/page-shell";
import { ReportButton } from "@/components/report-button";
import { ScoringNote } from "@/components/scoring-note";
import { SharePanel } from "@/components/share-panel";
import { TeamGrid } from "@/components/team-grid";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { DIVISION_COLUMNS, tableSizes, type Division } from "@/lib/divisions";
import {
  accentStyle,
  isLocked,
  isPresetLeague,
  LEAGUE_COLUMNS,
  leagueNoun,
  leagueTypeLabel,
  mergedLeagueSlug,
  seasonTitle,
  surfaceFor,
  TEAM_COLUMNS,
  toTeam,
  zonesOf,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";
import { describeZones } from "@/lib/zones";

// Shared by the page and its metadata, so they make one read between them.
const readLeague = cache(async (slug: string) => {
  const { supabase } = await getSession();
  const { data } = await supabase.from("league_details").select(LEAGUE_COLUMNS).eq("slug", slug).maybeSingle();
  return data as unknown as LeagueRow | null;
});

export async function generateMetadata({ params }: PageProps<"/leagues/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const league = await readLeague(slug);
  return {
    title: `${league?.name ?? "League"} | Final Table`,
    // Only global leagues belong in search results. Everything else belongs to the players who made it.
    ...(league?.type === "official" ? {} : { robots: { index: false } }),
  };
}

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

  const league = await readLeague(slug);
  if (!league) {
    const merged = mergedLeagueSlug(slug);
    if (merged) redirect(`/leagues/${merged}`);
    notFound();
  }

  const [{ data: teamRowsData }, { data: divisionRows }, membership, ownPrediction, isAdmin] = await Promise.all([
    supabase.from("teams").select(TEAM_COLUMNS).eq("season_id", league.season_id),
    supabase.from("divisions").select(DIVISION_COLUMNS).eq("season_id", league.season_id).order("position"),
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

  const teamRows = (teamRowsData ?? []) as TeamRow[];
  const teams = teamRows
    .map(toTeam)
    .sort((a, b) => a.name.localeCompare(b.name));
  const divisions = (divisionRows ?? []) as Division[];
  const zoneLines = describeZones(zonesOf(league));
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
  const isHidden = league.hidden_at !== null;
  const noun = leagueNoun(league);

  return (
    <div className="flex flex-col gap-5">
      <div
        style={accentStyle(league.competition_accent)}
        data-surface={surfaceFor(league.sport)}
        className="league-header relative overflow-hidden rounded-2xl p-5"
      >
        <p className="text-sm font-semibold text-foreground/90">
          {leagueTypeLabel(league)}
          {league.sport ? ` · ${league.sport}` : ""}
          {isDraft ? " · Draft" : league.status === "finished" ? " · Finished" : isLive ? " · Live" : ""}
        </p>
        <h1 className="poster text-4xl break-words">{league.name}</h1>
        {isPreset && <p className="text-foreground/90">Playing {title}</p>}
        <p className="mt-1 text-foreground/90">
          {locked ? "Started " : "Predictions lock "}
          <LocalTime iso={league.deadline} />
        </p>
      </div>

      {isHidden && (
        <p role="status" className="rounded-lg border border-relegation bg-surface p-3">
          This {noun} has been hidden by an admin while it&apos;s reviewed. Its players can&apos;t open it, and
          nobody new can join.
        </p>
      )}

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
      ) : isHidden && !role ? null : !role ? (
        <JoinButton
          leagueId={league.id}
          slug={league.slug}
          label={locked && !prediction ? `Follow this ${noun}` : `Join this ${noun}`}
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
            ? `You're following this ${noun} as a spectator.`
            : `This ${noun} has started, and you didn't get a prediction in.`}
        </p>
      ) : null}

      {title && role === "player" && prediction && !locked && (
        <p className="text-sm text-muted">
          You have one table for {title}, and it counts in every league and group you&apos;re in for
          that season.
        </p>
      )}

      {isLive && (
        <LiveSeason
          session={session}
          league={league}
          teams={teams}
          divisions={divisions}
          ownOrder={role === "player" ? ownOrder : null}
          canUpdate={!isPreset && canManage}
          canReopen={!isPreset && isAdmin}
          view={readLiveView(query)}
        />
      )}

      {!isDraft && !isHidden && (canManage || role || league.type !== "private") && (
        <SharePanel
          leagueId={league.id}
          leagueName={league.name}
          joinCode={league.join_code}
          canRotate={canManage && !isOfficial}
          closed={locked}
        />
      )}

      {canManage && !isDraft && !locked && (
        <Link
          href={`/leagues/${league.id}/setup?step=${isPreset ? "basics" : "teams"}`}
          className="flex h-12 items-center justify-center rounded-lg border border-line font-semibold"
        >
          {isPreset ? "Group settings" : `Edit ${noun}`}
        </Link>
      )}

      {!isLive && (
        <section aria-label="Teams">
          <h2 className="mb-2 font-display text-xl font-bold">{teams.length} teams</h2>
          {isPreset && (
            <p className="mb-2 text-sm text-muted">
              Teams and standings come from the global league, so they update automatically.
            </p>
          )}
          {zoneLines.length > 0 && (
            <p className="mb-2 text-sm text-muted">
              {[...(divisions.length > 0 ? ["In each conference"] : []), ...zoneLines].join(" · ")}
            </p>
          )}
          {divisions.length > 0 ? (
            <div className="flex flex-col gap-4">
              {divisions.map((division) => (
                <section key={division.id} aria-label={division.name}>
                  <h3 className="poster mb-2 text-2xl">{division.name}</h3>
                  <TeamGrid teams={teams.filter((team) => team.divisionId === division.id)} />
                </section>
              ))}
            </div>
          ) : (
            <TeamGrid teams={teams} />
          )}
          <div className="mt-2">
            <ScoringNote league={league} tableSizes={tableSizes(teams, divisions)} />
          </div>
        </section>
      )}

      {isAdmin && !isDraft && (
        <LeagueModeration leagueId={league.id} isHidden={isHidden} isOfficial={isOfficial} noun={noun} />
      )}

      {userId && !isDraft && !isCreator && !isHidden && (
        <ReportButton
          leagueId={league.id}
          noun={noun}
          logoTeams={teamRows
            .filter((team) => team.logo_path)
            .map((team) => ({ id: team.id, name: team.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
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
