import type { Metadata } from "next";
import Link from "next/link";
import { ExploreHeading } from "@/components/explore-heading";
import { GroupList } from "@/components/group-list";
import { GroupSearchForm } from "@/components/group-search-form";
import { JoinedLeaguesProvider } from "@/components/joined-leagues";
import { PageShell } from "@/components/page-shell";
import { readDirectory, readPublicGroups } from "@/lib/directory";
import { accentsByCompetition, type PublicGroup } from "@/lib/directory-rows";

export const metadata: Metadata = {
  title: "Public groups | Final Table",
  description: "Find a public group to play in, or see how other people's predictions are doing.",
};

const OWN_LEAGUES = "Made by players";

// Groups playing the same league together, biggest first, with players' own tables after them.
function byCompetition(groups: PublicGroup[]) {
  const named = groups.flatMap((group) => (group.competition_name ? [group.competition_name] : []));
  return [...new Set(named), ...(groups.some((group) => !group.competition_name) ? [OWN_LEAGUES] : [])].map((title) => ({
    title,
    groups: groups.filter((group) => (group.competition_name ?? OWN_LEAGUES) === title),
  }));
}

function Listing({
  title,
  groups,
  accents,
}: {
  title: string;
  groups: PublicGroup[];
  accents: Map<string, string>;
}) {
  return (
    <section aria-label={`${title} groups`} className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      {byCompetition(groups).map((competition) => (
        <div key={competition.title} className="flex flex-col gap-2">
          <h3 className="font-semibold text-muted">{competition.title}</h3>
          <GroupList groups={competition.groups} accents={accents} />
        </div>
      ))}
    </section>
  );
}

export default async function PublicGroupsPage() {
  const [rows, groups] = await Promise.all([readDirectory(), readPublicGroups(1, 100)]);
  const accents = accentsByCompetition(rows);
  const active = groups.filter((group) => group.state !== "finished");
  const finished = groups.filter((group) => group.state === "finished");

  return (
    <PageShell wide>
      <JoinedLeaguesProvider>
        <div className="flex flex-col gap-5">
          <ExploreHeading current="groups" />
          <GroupSearchForm />
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-display text-3xl font-bold">No public groups yet</h2>
              <p className="mt-1 text-muted">Be the first, and get your friends in on it.</p>
              <Link
                href="/leagues/new"
                className="mt-3 flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
              >
                Create a group
              </Link>
            </div>
          ) : (
            <>
              {active.length > 0 && <Listing title="Active" groups={active} accents={accents} />}
              {finished.length > 0 && <Listing title="Finished" groups={finished} accents={accents} />}
            </>
          )}
        </div>
      </JoinedLeaguesProvider>
    </PageShell>
  );
}
