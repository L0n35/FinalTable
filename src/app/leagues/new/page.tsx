import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFallback } from "@/components/page-fallback";
import { PageShell } from "@/components/page-shell";
import { WizardLoader } from "@/components/wizard/wizard-loader";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { readDirectory } from "@/lib/directory";
import { splitDirectory } from "@/lib/directory-rows";
import { isLocked, LEAGUE_COLUMNS, readStartKind, type LeagueRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "Start a league or group | Final Table" };

async function NewLeague({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const { kind } = await searchParams;
  const session = await getSession();
  if (!session.userId) {
    // Keeps what they chose through sign-in. Whether they can have it is checked when they return.
    const requested = readStartKind(kind, true);
    const next = requested ? `/leagues/new?kind=${requested}` : "/leagues/new";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const [isAdmin, { data }, directory] = await Promise.all([
    isCurrentUserAdmin(session),
    session.supabase.from("league_details").select(LEAGUE_COLUMNS).eq("type", "official"),
    readDirectory(),
  ]);
  const official = (data ?? []) as unknown as LeagueRow[];
  const presets = official.filter(
    (league) => league.status === "published" && !league.hidden_at && !isLocked(league),
  );

  return (
    <WizardLoader
      initialLeague={null}
      initialTeams={[]}
      isAdmin={isAdmin}
      initialStep="basics"
      presets={presets}
      comingSoon={splitDirectory(directory).comingSoon.map((row) => row.competition_name)}
      officialSeasons={isAdmin ? official : []}
      initialKind={readStartKind(kind, isAdmin)}
    />
  );
}

export default function NewLeaguePage({ searchParams }: PageProps<"/leagues/new">) {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <NewLeague searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
