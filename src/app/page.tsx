import { Suspense } from "react";
import Link from "next/link";
import { AccountStatus } from "@/components/account-status";
import { GroupList } from "@/components/group-list";
import { HeroTable } from "@/components/hero-table";
import { JoinCodeForm } from "@/components/join-code-form";
import { JoinedLeaguesProvider } from "@/components/joined-leagues";
import { ComingSoonList, LeagueCard } from "@/components/league-card";
import { PageShell } from "@/components/page-shell";
import { RunYourOwn } from "@/components/run-your-own";
import { YourLeagues } from "@/components/your-leagues";
import { readDirectory, readPublicGroups } from "@/lib/directory";
import { accentsByCompetition, splitDirectory, type ListedLeague } from "@/lib/directory-rows";

// Enough people that a brand-new league or group can't put its name on the front page.
const HOME_GROUP_MIN_PLAYERS = 3;
const HOME_GROUP_LIMIT = 6;

const HOW_IT_WORKS = [
  { title: "Rank", text: "Drag every team into the order you think they'll finish." },
  { title: "Lock", text: "Your table locks at the first game. Change it as often as you like until then." },
  { title: "Score", text: "Earn points for how close you get, with bonuses for first place and the zones." },
];

function SectionHeading({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="poster text-3xl">{title}</h2>
      {href && (
        <Link href={href} className="-my-2 shrink-0 py-2 font-semibold text-accent">
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

// Swipes sideways on a phone, with the next card peeking in to show there's more.
function CardRail({ leagues }: { leagues: ListedLeague[] }) {
  return (
    <ul className="rail -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
      {leagues.map((league) => (
        <li key={league.league_id} className="w-[84%] max-w-sm shrink-0 snap-start only:w-full only:max-w-none md:w-auto md:max-w-none md:only:col-span-2">
          <LeagueCard league={league} />
        </li>
      ))}
    </ul>
  );
}

function Hero() {
  return (
    <section aria-label="Welcome" className="visitor-only grid items-center gap-6 md:grid-cols-2 md:gap-10">
      <div>
        <p className="poster text-[15.5vw] leading-[0.92] tracking-tight md:text-7xl">
          Call the <span className="chalk-underline block w-max max-w-full text-accent">final table.</span>
        </p>
        <p className="mt-3 text-lg text-muted">
          Rank every team before the season starts, then watch your predictions play out against your friends and the
          crowd.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/explore"
            className="poster flex h-14 items-center justify-center rounded-xl bg-accent text-2xl text-accent-ink"
          >
            Make your first prediction
          </Link>
          <div className="flex flex-col items-center sm:flex-row sm:justify-center sm:gap-6">
            <Link href="/demo" className="flex h-11 items-center font-semibold underline">
              Try the demo, no account needed
            </Link>
            <Link href="#run-your-own" className="flex h-11 items-center font-semibold underline">
              Or run your own league
            </Link>
          </div>
        </div>
      </div>
      <HeroTable />
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-label="How it works" className="visitor-only">
      <SectionHeading title="How it works" />
      <ol className="grid gap-2 md:grid-cols-3">
        {HOW_IT_WORKS.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="poster flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-xl">
              {index + 1}
            </span>
            <span>
              <span className="block font-display text-xl leading-tight font-bold">{step.title}</span>
              <span className="block text-sm text-muted">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function Home() {
  const [rows, groups] = await Promise.all([readDirectory(), readPublicGroups(HOME_GROUP_MIN_PLAYERS, HOME_GROUP_LIMIT)]);
  const { open, live, comingSoon } = splitDirectory(rows);

  return (
    <PageShell wide>
      <JoinedLeaguesProvider>
        <div className="flex flex-col gap-8 pt-2">
          <h1 className="sr-only">Final Table: predict how the league will finish, then see who called it</h1>

          <Suspense>
            <YourLeagues />
          </Suspense>

          <Hero />

          {open.length > 0 && (
            <section aria-label="Open now">
              <SectionHeading title="Open now" href="/explore" linkLabel="All leagues" />
              <CardRail leagues={open} />
            </section>
          )}

          <RunYourOwn />

          {live.length > 0 && (
            <section aria-label="Live now">
              <SectionHeading title="Live now" />
              <CardRail leagues={live} />
            </section>
          )}

          {groups.length > 0 && (
            <section aria-label="Run by players">
              <SectionHeading title="Run by players" href="/explore/groups" linkLabel="See all" />
              <GroupList groups={groups} accents={accentsByCompetition(rows)} />
            </section>
          )}

          <HowItWorks />

          {comingSoon.length > 0 && (
            <section aria-label="Coming soon">
              <SectionHeading title="Coming soon" />
              <ComingSoonList rows={comingSoon} />
            </section>
          )}

          <section aria-label="Play with friends" className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <h2 className="poster text-2xl">Got a join code?</h2>
              <JoinCodeForm />
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <h2 className="poster text-2xl">Playing with friends?</h2>
              <Link
                href="/leagues/new?kind=preset"
                prefetch={false}
                className="flex h-13 items-center justify-center rounded-lg border border-line font-semibold"
              >
                Create a group
              </Link>
            </div>
          </section>

          <Suspense>
            <AccountStatus />
          </Suspense>
        </div>
      </JoinedLeaguesProvider>
    </PageShell>
  );
}
