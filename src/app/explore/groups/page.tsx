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
  title: "Run by players | Final Table",
  description: "Find a public league or group to play in, or see how other people's predictions are doing.",
};

const OWN_LEAGUES = "Players' own leagues";

// Groups playing the same real league together, biggest first, with players' own leagues after them.
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
    <section aria-label={`${title} leagues and groups`} className="flex flex-col gap-4">
      <h2 className="poster text-3xl">{title}</h2>
      {byCompetition(groups).map((competition) => (
        <div key={competition.title} className="flex flex-col gap-2">
          <h3 className="font-semibold text-muted">{competition.title}</h3>
          <GroupList groups={competition.groups} accents={accents} />
        </div>
      ))}
    </section>
  );
}

function StartYourOwn() {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Link
        href="/leagues/new?kind=custom"
        prefetch={false}
        className="poster flex h-13 items-center justify-center rounded-xl bg-accent text-xl text-accent-ink"
      >
        Run your own league
      </Link>
      <Link
        href="/leagues/new?kind=preset"
        prefetch={false}
        className="flex h-13 items-center justify-center rounded-xl border border-line font-semibold"
      >
        Create a group on a real league
      </Link>
    </div>
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
              <h2 className="poster text-3xl">Nothing here yet</h2>
              <p className="mt-1 text-muted">Be the first, and get your friends in on it.</p>
            </div>
          ) : (
            <>
              {active.length > 0 && <Listing title="Active" groups={active} accents={accents} />}
              {finished.length > 0 && <Listing title="Finished" groups={finished} accents={accents} />}
            </>
          )}
          <StartYourOwn />
        </div>
      </JoinedLeaguesProvider>
    </PageShell>
  );
}
