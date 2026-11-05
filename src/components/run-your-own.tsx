import Link from "next/link";
import { TeamBadge } from "@/components/team-badge";
import { demoLeague } from "@/lib/demo-league";

const STEPS = [
  { title: "Add your teams", text: "Any sport, any level, from 4 to 40 teams." },
  { title: "Your players predict", text: "They rank the table before the lock date you set." },
  { title: "You keep the table", text: "Update the standings after each round, and everyone's scores follow." },
];

// Made-up teams and players. Each score is what the real rules give for a pick against this table.
const EXAMPLE_TABLE = [
  { teamId: "bramley", move: 1 },
  { teamId: "ashford", move: -1 },
  { teamId: "dunmere", move: 0 },
  { teamId: "castlegate", move: 0 },
];
const EXAMPLE_PLAYERS = [
  { name: "Priya", points: 24, move: 2 },
  { name: "Marcus", points: 14, move: -1 },
  { name: "Dee", points: 12, move: -1 },
];

function Move({ by }: { by: number }) {
  if (by === 0) return <span className="text-muted">–</span>;
  return (
    <span className={by > 0 ? "text-promotion" : "text-relegation"}>
      {by > 0 ? "▲" : "▼"}
      {Math.abs(by)}
    </span>
  );
}

function ExampleLeague() {
  return (
    <div aria-hidden="true" className="rounded-2xl border-[1.5px] border-chalk bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-display text-xl font-bold">Hillside Sunday League</span>
        <span className="shrink-0 rounded-md border border-chalk px-2 py-0.5 text-sm font-semibold text-muted">
          Example
        </span>
      </div>

      <p className="mt-3 mb-1 text-sm font-semibold text-muted">The table you keep</p>
      <ol>
        {EXAMPLE_TABLE.map(({ teamId, move }, index) => {
          const team = demoLeague.teams.find((candidate) => candidate.id === teamId)!;
          return (
            <li key={teamId} className="flex h-11 items-center gap-2">
              <span className="w-5 shrink-0 text-center font-display text-lg font-bold text-muted">{index + 1}</span>
              <TeamBadge team={team} />
              <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
              <span className="text-sm font-semibold">
                <Move by={move} />
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 mb-1 border-t border-line pt-3 text-sm font-semibold text-muted">Your players&apos; scores</p>
      <ol>
        {EXAMPLE_PLAYERS.map(({ name, points, move }, index) => (
          <li key={name} className="flex h-9 items-center gap-2">
            <span className="w-5 shrink-0 text-center font-display text-lg font-bold text-muted">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            <span className="font-display text-lg font-bold tabular-nums">{points} pts</span>
            <span className="w-7 text-right text-sm font-semibold">
              <Move by={move} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// What sets Final Table apart: anyone can run a league here, at any level, and keep its table themselves.
export function RunYourOwn() {
  return (
    <section
      id="run-your-own"
      aria-labelledby="run-your-own-title"
      data-surface="football"
      className="league-header relative grid scroll-mt-4 grid-cols-1 gap-6 overflow-hidden rounded-2xl p-5 md:grid-cols-2 md:gap-10 md:p-8"
    >
      <div className="flex flex-col">
        <h2 id="run-your-own-title" className="poster text-5xl leading-none md:text-6xl">
          Run your own league
        </h2>
        <p className="mt-3 text-lg text-foreground/90">
          Sunday league, lower league, five-a-side, the office. If your league has a table, your players can predict it
          here.
        </p>
        <ol className="mt-4 mb-5 flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="poster flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-xl">
                {index + 1}
              </span>
              <span>
                <span className="block font-display text-xl leading-tight font-bold">{step.title}</span>
                <span className="block text-sm text-foreground/90">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link
          href="/leagues/new?kind=custom"
          prefetch={false}
          className="poster mt-auto flex h-14 items-center justify-center rounded-xl bg-accent-on-turf text-2xl text-accent-ink"
        >
          Start your league
        </Link>
      </div>
      <ExampleLeague />
    </section>
  );
}
