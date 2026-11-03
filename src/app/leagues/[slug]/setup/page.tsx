import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageFallback, PageShell } from "@/components/page-shell";
import type { WizardStep } from "@/components/wizard/league-wizard";
import { WizardLoader } from "@/components/wizard/wizard-loader";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { isLocked, LEAGUE_COLUMNS, TEAM_COLUMNS, type LeagueRow, type TeamRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "League setup | Final Table" };

const WIZARD_STEPS: WizardStep[] = ["basics", "teams", "format", "review"];

async function Setup({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const [{ slug: leagueId }, { step }] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session.userId) {
    redirect(`/login?next=${encodeURIComponent(`/leagues/${leagueId}/setup`)}`);
  }

  // A non-uuid can't match a league, and the database would reject it as a malformed value.
  if (!/^[0-9a-f-]{36}$/i.test(leagueId)) notFound();

  const { supabase, userId } = session;
  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("id", leagueId)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) notFound();

  const isAdmin = await isCurrentUserAdmin(session);
  if (league.created_by !== userId && !isAdmin) notFound();

  if (isLocked(league) || league.status === "finished") {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">{league.name} has started</h1>
        <p className="mt-1 mb-4 text-muted">A league&apos;s setup is locked once it starts.</p>
        <Link href={`/leagues/${league.slug}`} className="font-semibold underline">
          Back to the league
        </Link>
      </div>
    );
  }

  const { data: teams } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("season_id", league.season_id)
    .order("created_at");

  const requested = WIZARD_STEPS.find((candidate) => candidate === step);

  return (
    <WizardLoader
      initialLeague={league}
      initialTeams={(teams ?? []) as TeamRow[]}
      isAdmin={isAdmin}
      initialStep={requested ?? "basics"}
    />
  );
}

export default function SetupPage({ params, searchParams }: PageProps<"/leagues/[slug]/setup">) {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <Setup params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
