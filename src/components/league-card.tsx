import type { ReactNode } from "react";
import Link from "next/link";
import { JoinedOr } from "@/components/joined-leagues";
import { LocalTime } from "@/components/local-time";
import { TeamBadge } from "@/components/team-badge";
import { TimeLeft } from "@/components/time-left";
import {
  crowdLine,
  leaderLine,
  playerCountLine,
  teamsLine,
  type DirectoryRow,
  type ListedLeague,
} from "@/lib/directory-rows";
import { accentStyle, surfaceFor, toTeam } from "@/lib/leagues";

const MIN_MARQUEE_BADGES = 12;

export function StatePill({ state }: { state: "open" | "live" | "finished" }) {
  if (state === "open") {
    return (
      <span className="poster shrink-0 -rotate-3 rounded-md bg-accent px-2 py-0.5 text-sm leading-tight text-accent-ink">
        Open
      </span>
    );
  }
  if (state === "live") {
    return (
      <span className="poster flex shrink-0 items-center gap-1.5 rounded-md bg-background/75 px-2 py-0.5 text-sm leading-tight">
        <span className="live-dot" aria-hidden="true" />
        Live
      </span>
    );
  }
  return (
    <span className="poster shrink-0 rounded-md bg-background/75 px-2 py-0.5 text-sm leading-tight">Finished</span>
  );
}

function SportLabel({ sport }: { sport: string }) {
  return <span className="truncate text-sm font-semibold text-foreground/90">{sport}</span>;
}

function BadgeStrip({ league }: { league: ListedLeague }) {
  const badges = league.badges ?? [];
  const others = league.team_count - badges.length;
  return (
    <span className="flex items-center" aria-hidden="true">
      {badges.map((badge, index) => (
        <span key={badge.name} className={index > 0 ? "-ml-1.5" : ""}>
          <TeamBadge team={toTeam({ ...badge, id: badge.name })} />
        </span>
      ))}
      {others > 0 && <span className="ml-1.5 text-sm font-semibold text-foreground/90">+{others}</span>}
    </span>
  );
}

function actionLabel(state: ListedLeague["state"]) {
  if (state === "open") return "Make your prediction";
  return state === "live" ? "See who's winning" : "See the final table";
}

function CardAction({ league }: { league: ListedLeague }) {
  return (
    <JoinedOr leagueId={league.league_id}>
      <span className="font-semibold text-accent-on-turf">
        {actionLabel(league.state)} <span aria-hidden="true">→</span>
      </span>
    </JoinedOr>
  );
}

// What makes someone curious enough to tap: who's ahead, or who everyone else is backing.
function CardFacts({ league }: { league: ListedLeague }) {
  const leader = leaderLine(league);
  const crowd = crowdLine(league);
  const players = playerCountLine(league);
  const lines = [leader, crowd, players].filter(Boolean);
  if (lines.length > 0) {
    return (
      <>
        {leader && <span className="block font-semibold">{leader}</span>}
        {crowd && <span className="block text-sm text-foreground/90">{crowd}</span>}
        {players && <span className="block text-sm text-foreground/90">{players}</span>}
      </>
    );
  }
  return (
    <span className="block text-sm text-foreground/90">
      {league.state === "open"
        ? "Early days: get your table in"
        : league.state === "live"
          ? "Scores start with the first table update"
          : "This season has finished"}
    </span>
  );
}

function CardFrame({
  league,
  className = "p-4",
  children,
}: {
  league: ListedLeague;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/leagues/${league.slug}`}
      style={accentStyle(league.accent)}
      data-surface={surfaceFor(league.sport)}
      className={`league-card relative flex h-full flex-col overflow-hidden rounded-2xl transition-[transform,filter] active:scale-[0.985] md:hover:brightness-110 ${className}`}
    >
      {children}
    </Link>
  );
}

export function LeagueCard({ league }: { league: ListedLeague }) {
  return (
    <CardFrame league={league}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <StatePill state={league.state} />
          <SportLabel sport={league.sport} />
        </span>
        {league.state === "open" && (
          <TimeLeft iso={league.deadline} className="shrink-0 text-sm font-bold tabular-nums" />
        )}
      </span>
      <h3 className="poster mt-3 text-4xl leading-none break-words">{league.competition_name}</h3>
      <span className="mt-1 text-sm text-foreground/90">{teamsLine(league)}</span>
      <span className="mt-3">
        <BadgeStrip league={league} />
      </span>
      <span className="mt-3 flex-1">
        <CardFacts league={league} />
      </span>
      <span className="mt-3 flex items-center justify-between gap-2 text-sm">
        {league.state === "open" ? (
          <span className="text-foreground/90">
            Locks <LocalTime iso={league.deadline} dateOnly />
          </span>
        ) : (
          <span />
        )}
        <CardAction league={league} />
      </span>
    </CardFrame>
  );
}

// The next league to lock, given the most room because it's the most urgent thing on the page.
export function FeaturedLeagueCard({ league }: { league: ListedLeague }) {
  return (
    <CardFrame league={league} className="league-card-featured p-5">
      <span className="flex items-center justify-between gap-2">
        <span className="poster text-foreground/90">Locks next</span>
        <StatePill state={league.state} />
      </span>
      <h3 className="poster mt-3 text-5xl leading-none break-words">{league.competition_name}</h3>
      <span className="mt-1 text-foreground/90">{teamsLine(league)}</span>
      <TimeLeft iso={league.deadline} className="poster mt-4 text-[clamp(2.75rem,15vw,3.75rem)] leading-none text-accent-on-turf normal-case tabular-nums" />
      <span className="mt-1 text-sm text-foreground/90">
        Predictions lock <LocalTime iso={league.deadline} />
      </span>
      <span className="mt-4">
        <BadgeStrip league={league} />
      </span>
      <span className="mt-3">
        <CardFacts league={league} />
      </span>
      <span className="poster mt-4 flex h-13 items-center justify-center rounded-xl bg-accent-on-turf text-xl text-accent-ink md:max-w-sm">
        <JoinedOr leagueId={league.league_id} className="">
          <>
            Make your prediction <span aria-hidden="true">&nbsp;→</span>
          </>
        </JoinedOr>
      </span>
    </CardFrame>
  );
}

// Every league's clubs streaming past, so the page feels alive and shows how much there is to play.
export function BadgeMarquee({ rows }: { rows: DirectoryRow[] }) {
  const badges = rows
    .flatMap((row) => row.badges ?? [])
    .sort((a, b) => (a.short_name ?? a.name).localeCompare(b.short_name ?? b.name));
  if (badges.length < MIN_MARQUEE_BADGES) return null;
  return (
    <div aria-hidden="true" className="badge-marquee -mx-4 overflow-hidden md:mx-0">
      <div className="badge-marquee-track flex w-max">
        {[...badges, ...badges].map((badge, index) => (
          <span key={index} className="pr-2">
            <TeamBadge team={toTeam({ ...badge, id: badge.name })} />
          </span>
        ))}
      </div>
    </div>
  );
}

// There's no league page yet, so this says what's coming rather than linking anywhere. It shows only
// the league's colour, because the ground is for leagues people can play.
function ComingSoonTile({ row }: { row: DirectoryRow }) {
  return (
    <div
      style={accentStyle(row.accent)}
      data-surface="plain"
      className="league-tile flex h-full min-h-12 items-center rounded-xl border border-chalk px-3 py-2"
    >
      <span className="font-display text-xl leading-tight font-bold">{row.competition_name}</span>
    </div>
  );
}

// Grouped by when they open, since football and basketball seasons start at different times.
export function ComingSoonList({ rows }: { rows: DirectoryRow[] }) {
  const notes = [...new Set(rows.map((row) => row.opens_note))];
  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <div key={note} className="flex flex-col gap-2">
          {note && <p className="text-sm text-muted">{note}</p>}
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {rows
              .filter((row) => row.opens_note === note)
              .map((row) => (
                <li key={row.competition_id}>
                  <ComingSoonTile row={row} />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
