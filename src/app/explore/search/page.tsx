import { Suspense } from "react";
import type { Metadata } from "next";
import { ExploreHeading } from "@/components/explore-heading";
import { GroupList } from "@/components/group-list";
import { GroupSearchForm } from "@/components/group-search-form";
import { JoinedLeaguesProvider } from "@/components/joined-leagues";
import { PageFallback } from "@/components/page-fallback";
import { PageShell } from "@/components/page-shell";
import { readDirectory, searchPublicGroups } from "@/lib/directory";
import { accentsByCompetition } from "@/lib/directory-rows";

export const metadata: Metadata = {
  title: "Search leagues and groups | Final Table",
  robots: { index: false },
};

async function Results({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const [rows, groups] = await Promise.all([readDirectory(), query ? searchPublicGroups(query) : []]);

  return (
    <div className="flex flex-col gap-4">
      <GroupSearchForm key={query} query={query} />
      {!query ? (
        <p className="text-muted">Type part of a league or group&apos;s name to find it.</p>
      ) : groups.length === 0 ? (
        <p className="text-muted">No public leagues or groups match that search.</p>
      ) : (
        <GroupList groups={groups} accents={accentsByCompetition(rows)} />
      )}
    </div>
  );
}

export default function SearchGroupsPage({ searchParams }: PageProps<"/explore/search">) {
  return (
    <PageShell wide>
      <JoinedLeaguesProvider>
        <div className="flex flex-col gap-5">
          <ExploreHeading current="groups" />
          <Suspense fallback={<PageFallback />}>
            <Results searchParams={searchParams} />
          </Suspense>
        </div>
      </JoinedLeaguesProvider>
    </PageShell>
  );
}
