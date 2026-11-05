"use client";

import { useState } from "react";
import { ComingSoonList, FeaturedLeagueCard, LeagueCard } from "@/components/league-card";
import { sportsIn, splitDirectory, type DirectoryRow, type ListedLeague } from "@/lib/directory-rows";

function CardGrid({ leagues }: { leagues: ListedLeague[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {leagues.map((league) => (
        <li key={league.league_id} className="md:only:col-span-2">
          <LeagueCard league={league} />
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="poster text-3xl">{title}</h2>
      {children}
    </section>
  );
}

// Filters in the browser, so the page reads nothing from the URL and stays cached for everyone.
export function ExploreLeagues({ rows }: { rows: DirectoryRow[] }) {
  const [sport, setSport] = useState<string | null>(null);

  const sports = sportsIn(rows);
  const { open, live, finished, comingSoon } = splitDirectory(
    sport ? rows.filter((row) => row.sport === sport) : rows,
  );
  const [next, ...otherOpen] = open;
  const chipClass = (selected: boolean) =>
    `poster flex h-11 shrink-0 items-center rounded-full border px-4 text-lg normal-case ${
      selected ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
    }`;

  return (
    <div className="flex flex-col gap-6">
      {sports.length > 1 && (
        <div role="group" aria-label="Filter by sport" className="rail -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <button type="button" aria-pressed={sport === null} onClick={() => setSport(null)} className={chipClass(sport === null)}>
            All sports
          </button>
          {sports.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={sport === item}
              onClick={() => setSport(item)}
              className={chipClass(sport === item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {next ? (
        <FeaturedLeagueCard league={next} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="poster text-3xl">Nothing to predict {sport ? `in ${sport} ` : ""}right now</h2>
          <p className="mt-1 text-muted">
            {comingSoon.length > 0
              ? "New seasons are on the way. Have a look at what's coming below."
              : "New seasons are on the way, so check back soon."}
          </p>
        </div>
      )}

      {otherOpen.length > 0 && (
        <Section title="Open now">
          <CardGrid leagues={otherOpen} />
        </Section>
      )}
      {live.length > 0 && (
        <Section title="In play">
          <CardGrid leagues={live} />
        </Section>
      )}
      {comingSoon.length > 0 && (
        <Section title="Coming soon">
          <ComingSoonList rows={comingSoon} />
        </Section>
      )}
      {finished.length > 0 && (
        <Section title="Finished">
          <CardGrid leagues={finished} />
        </Section>
      )}
    </div>
  );
}
