import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { PageFallback, PageShell } from "@/components/page-shell";
import { getSession, type Session } from "@/lib/auth";
import { isLocked, LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "Explore | Final Table" };

const COMMUNITY_LIMIT = 50;

function LeagueCard({ league, joined }: { league: LeagueRow; joined: boolean }) {
  return (
    <li>
      <Link
        href={`/leagues/${league.slug}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {league.type === "official" ? league.season_label : league.name}
          </span>
          <span className="block text-sm text-muted">
            {league.team_count} teams · {isLocked(league) ? "Started " : "Locks "}
            <LocalTime iso={league.deadline} />
          </span>
        </span>
        <span
          className={`shrink-0 text-sm font-semibold ${joined ? "text-muted" : "text-accent"}`}
        >
          {joined ? "Joined" : "View"}
        </span>
      </Link>
    </li>
  );
}

function OfficialTab({ leagues, joined }: { leagues: LeagueRow[]; joined: Set<string> }) {
  if (leagues.length === 0) {
    return <p className="text-muted">No official leagues are open yet. Check back soon.</p>;
  }

  const sports = [...new Set(leagues.map((league) => league.sport ?? "Other"))].sort();
  return (
    <div className="flex flex-col gap-6">
      {sports.map((sport) => {
        const inSport = leagues.filter((league) => (league.sport ?? "Other") === sport);
        const competitions = [...new Set(inSport.map((league) => league.competition_name ?? ""))].sort();
        return (
          <section key={sport} aria-label={sport}>
            <h2 className="mb-2 font-display text-2xl font-bold">{sport}</h2>
            <div className="flex flex-col gap-3">
              {competitions.map((competition) => (
                <div key={competition}>
                  <h3 className="mb-1 font-semibold text-muted">{competition}</h3>
                  <ul className="flex flex-col gap-2">
                    {inSport
                      .filter((league) => league.competition_name === competition)
                      .sort((a, b) => a.deadline.localeCompare(b.deadline))
                      .map((league) => (
                        <LeagueCard key={league.id} league={league} joined={joined.has(league.id)} />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CommunityTab({
  leagues,
  joined,
  query,
}: {
  leagues: LeagueRow[];
  joined: Set<string>;
  query: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action="/explore" className="flex gap-2">
        <input type="hidden" name="tab" value="community" />
        <input
          type="search"
          name="q"
          aria-label="Search public leagues"
          defaultValue={query}
          maxLength={60}
          placeholder="Search public leagues"
          className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button type="submit" className="h-12 shrink-0 rounded-lg border border-line px-4 font-semibold">
          Search
        </button>
      </form>
      {leagues.length === 0 ? (
        <p className="text-muted">
          {query ? "No public leagues match that search." : "No public leagues yet. Why not create one?"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {leagues.map((league) => (
            <LeagueCard key={league.id} league={league} joined={joined.has(league.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

async function readLeagues({ supabase }: Session, tab: string, query: string) {
  let request = supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("type", tab === "community" ? "public" : "official")
    .eq("status", "published");
  if (tab === "community") {
    // % and _ are wildcards in a pattern, so a search for them is treated as plain text.
    const pattern = query.replace(/[%_\\]/g, "\\$&");
    if (pattern) request = request.ilike("name", `%${pattern}%`);
    request = request.order("deadline").limit(COMMUNITY_LIMIT);
  }
  const { data, error } = await request;
  // Shown on the error page, rather than looking like there are no leagues.
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeagueRow[];
}

async function Explore({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; q?: string | string[] }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "community" ? "community" : "official";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";

  const session = await getSession();
  if (!session.userId) redirect("/login?next=/explore");

  const [leagues, { data: memberships }] = await Promise.all([
    readLeagues(session, tab, query),
    session.supabase.from("memberships").select("league_id").eq("user_id", session.userId),
  ]);
  const joined = new Set((memberships ?? []).map((row) => row.league_id as string));

  return tab === "community" ? (
    <CommunityTab leagues={leagues} joined={joined} query={query} />
  ) : (
    <OfficialTab leagues={leagues} joined={joined} />
  );
}

function Tabs({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  return (
    <Suspense fallback={<div className="h-11" />}>
      <TabLinks searchParams={searchParams} />
    </Suspense>
  );
}

async function TabLinks({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const current = tab === "community" ? "community" : "official";
  const options = [
    { key: "official", label: "Official", href: "/explore" },
    { key: "community", label: "Community", href: "/explore?tab=community" },
  ];
  return (
    <nav aria-label="League types" className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={current === option.key ? "page" : undefined}
          className={`flex h-10 items-center justify-center rounded-md font-semibold ${
            current === option.key ? "bg-surface-raised text-foreground" : "text-muted"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold">Explore</h1>
        <Tabs searchParams={searchParams} />
        <Suspense fallback={<PageFallback />}>
          <Explore searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
