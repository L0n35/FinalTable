import type { Metadata } from "next";
import { ExploreHeading } from "@/components/explore-heading";
import { ExploreLeagues } from "@/components/explore-leagues";
import { JoinedLeaguesProvider } from "@/components/joined-leagues";
import { BadgeMarquee } from "@/components/league-card";
import { PageShell } from "@/components/page-shell";
import { readDirectory } from "@/lib/directory";

export const metadata: Metadata = {
  title: "Explore | Final Table",
  description: "Pick a league, rank every team and see who called it.",
};

export default async function ExplorePage() {
  const rows = await readDirectory();
  return (
    <PageShell wide>
      <JoinedLeaguesProvider>
        <div className="flex flex-col gap-5">
          <ExploreHeading current="leagues" />
          <BadgeMarquee rows={rows} />
          <ExploreLeagues rows={rows} />
        </div>
      </JoinedLeaguesProvider>
    </PageShell>
  );
}
