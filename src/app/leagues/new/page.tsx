import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFallback, PageShell } from "@/components/page-shell";
import { WizardLoader } from "@/components/wizard/wizard-loader";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { isLocked, LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "New league | Final Table" };

async function NewLeague({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const { kind } = await searchParams;
  const session = await getSession();
  if (!session.userId) redirect("/login?next=/leagues/new");

  const [isAdmin, { data }] = await Promise.all([
    isCurrentUserAdmin(session),
    session.supabase.from("league_details").select(LEAGUE_COLUMNS).eq("type", "official"),
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
      officialSeasons={isAdmin ? official : []}
      initialKind={kind === "official" && isAdmin ? "official" : null}
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
