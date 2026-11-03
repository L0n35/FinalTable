import Link from "next/link";
import { LeagueTable } from "@/components/league-table";
import { LocalTime } from "@/components/local-time";
import { ScoringNote } from "@/components/scoring-note";
import { SeasonControl } from "@/components/season-control";
import { TabNav } from "@/components/tab-nav";
import { ZoneLegend } from "@/components/zone-legend";
import type { Session } from "@/lib/auth";
import {
  initialsFor,
  leagueNoun,
  ordinal,
  zonesOf,
  type BoardRow,
  type LeagueRow,
  type Team,
} from "@/lib/leagues";

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type LiveView = { tab: "leaderboard" | "table" | "picks"; player: string | null; page: number };

type LiveSeasonProps = {
  session: Session;
  league: LeagueRow;
  teams: Team[];
  // The viewer's own table, when it counts.
  ownOrder: string[] | null;
  canUpdate: boolean;
  canReopen: boolean;
  view: LiveView;
};

function points(row: BoardRow) {
  return `${row.total_points} ${row.total_points === 1 ? "pt" : "pts"}`;
}

function Movement({ row }: { row: BoardRow }) {
  if (row.rank === null || row.previous_rank === null) return null;
  const change = row.previous_rank - row.rank;
  if (change === 0) {
    return (
      <span className="text-muted">
        <span aria-hidden="true">–</span>
        <span className="sr-only">No change</span>
      </span>
    );
  }
  const places = Math.abs(change);
  return (
    <span className={change > 0 ? "text-promotion" : "text-relegation"}>
      <span aria-hidden="true">
        {change > 0 ? "▲" : "▼"}
        {places}
      </span>
      <span className="sr-only">
        {change > 0 ? "Up" : "Down"} {places} {places === 1 ? "place" : "places"}
      </span>
    </span>
  );
}

function PlayerRow({
  row,
  href,
  isViewer,
  showScores,
}: {
  row: BoardRow;
  href: string;
  isViewer: boolean;
  showScores: boolean;
}) {
  const hasScore = showScores && row.rank !== null;
  return (
    <li>
      <Link
        href={href}
        className={`flex h-16 items-center gap-2 rounded-lg border bg-surface pr-3 ${
          showScores ? "" : "pl-3"
        } ${isViewer ? "border-accent" : "border-line"}`}
      >
        {showScores && (
          <span className="w-10 shrink-0 text-center font-display text-xl font-bold tabular-nums">
            {row.rank ?? "–"}
            <span className="block text-xs font-semibold">
              <Movement row={row} />
            </span>
          </span>
        )}
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-bold"
        >
          {initialsFor(row.display_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {row.display_name}
            {isViewer ? " (you)" : ""}
          </span>
          {hasScore && (
            <span className="block truncate text-sm text-muted">
              {row.exact_count} exact · {row.bonus_points} bonus
            </span>
          )}
        </span>
        <span className="shrink-0 font-display text-xl font-bold tabular-nums">
          {hasScore ? points(row) : showScores ? "" : <span className="text-muted">›</span>}
        </span>
      </Link>
    </li>
  );
}

function Pager({ path, tab, page, total }: { path: string; tab: string; page: number; total: number }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const hrefFor = (target: number) => `${path}?tab=${tab}&page=${target}`;
  const linkClass = "flex h-11 items-center rounded-lg border border-line px-4 font-semibold";
  return (
    <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function PositionNote({ label, position, exact }: { label: string; position: number; exact: boolean }) {
  return (
    <span className={exact ? "font-semibold text-promotion" : "text-muted"}>
      {label} {ordinal(position)}
      {exact ? " ✓" : ""}
    </span>
  );
}

// Teams listed by the given order. A team missing from the season can't appear in a saved table.
function teamsInOrder(order: string[], teams: Team[]) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return order.map((id) => byId.get(id)).filter((team) => team !== undefined);
}

export async function LiveSeason({
  session,
  league,
  teams,
  ownOrder,
  canUpdate,
  canReopen,
  view,
}: LiveSeasonProps) {
  const { supabase, userId } = session;
  const path = `/leagues/${league.slug}`;
  const zones = zonesOf(league);
  const finished = league.status === "finished";
  const noun = leagueNoun(league);
  const board = () => supabase.rpc("league_leaderboard", { p_league_id: league.id });

  const [latestResult, ownResult, winnersResult] = await Promise.all([
    supabase
      .from("standings_updates")
      .select("team_order, created_at, updated_by")
      .eq("season_id", league.season_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    userId ? board().eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
    finished ? board().eq("rank", 1).limit(3) : Promise.resolve({ data: [], error: null }),
  ]);
  // Shown on the error page, rather than looking like nobody is playing.
  const readError = latestResult.error ?? ownResult.error ?? winnersResult.error;
  if (readError) throw new Error(readError.message);

  const latest = latestResult.data as
    | { team_order: string[]; created_at: string; updated_by: string | null }
    | null;
  const ownRow = ((ownResult.data ?? []) as BoardRow[])[0] ?? null;
  const winners = (winnersResult.data ?? []) as BoardRow[];
  const actualOrder = latest?.team_order ?? null;

  // A custom league's creator can also be playing, so people can see who changed the table.
  let author: string | null = null;
  if (latest?.updated_by && userId && league.competition_id === null) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", latest.updated_by)
      .maybeSingle();
    author = (data?.display_name as string | undefined) ?? null;
  }

  const tabs = [
    { key: "leaderboard", label: "Leaderboard", href: path },
    { key: "table", label: "Table", href: `${path}?tab=table` },
    { key: "picks", label: "Picks", href: `${path}?tab=picks` },
  ];

  const updatedLine = latest && (
    <p className="text-sm text-muted">
      {finished ? "Final table, last updated " : "Table updated "}
      <LocalTime iso={latest.created_at} />
      {author ? ` by ${author}` : ""}
    </p>
  );

  const noUpdateYet = (
    <p className="rounded-lg border border-line bg-surface p-3 text-muted">
      {canUpdate
        ? "The standings haven't been updated yet. Add the first table to start the scoring."
        : "The standings haven't been updated yet. Points appear after the first update."}
    </p>
  );

  const pageRows = async () => {
    const from = (view.page - 1) * PAGE_SIZE;
    const { data, error } = await board().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return (data ?? []) as BoardRow[];
  };

  async function leaderboardTab() {
    const rows = await pageRows();
    return (
      <div className="flex flex-col gap-2">
        {!actualOrder && noUpdateYet}
        {actualOrder && (
          <p className="text-sm font-semibold text-muted">
            {finished ? "Final scores" : "Provisional until the season finishes"}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-muted">
            {view.page > 1 ? "There's nobody on this page." : `Nobody got a prediction in for this ${noun}.`}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <PlayerRow
                key={row.user_id}
                row={row}
                href={`${path}?tab=picks&player=${row.user_id}`}
                isViewer={row.user_id === userId}
                showScores
              />
            ))}
          </ol>
        )}
        <Pager path={path} tab="leaderboard" page={view.page} total={rows[0]?.entry_count ?? 0} />
        {updatedLine}
        <ScoringNote league={league} />
      </div>
    );
  }

  function tableTab() {
    if (!actualOrder) {
      return (
        <div className="flex flex-col gap-2">
          {noUpdateYet}
          {ownOrder && (
            <section aria-label="Your prediction">
              <h2 className="mt-2 mb-2 font-display text-xl font-bold">Your prediction</h2>
              <ZoneLegend zones={zones} total={teams.length} />
              <LeagueTable teams={teamsInOrder(ownOrder, teams)} zones={zones} />
            </section>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {updatedLine}
        {league.competition_id && league.type !== "official" && (
          <p className="text-sm text-muted">Updates automatically from the global league.</p>
        )}
        <ZoneLegend zones={zones} total={teams.length} />
        <LeagueTable
          teams={teamsInOrder(actualOrder, teams)}
          zones={zones}
          aside={
            ownOrder
              ? (team, position) => (
                  <PositionNote
                    label="You"
                    position={ownOrder.indexOf(team.id) + 1}
                    exact={ownOrder[position - 1] === team.id}
                  />
                )
              : undefined
          }
        />
      </div>
    );
  }

  async function picksTab() {
    if (!userId) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(`${path}?tab=picks`)}`}
          className="flex h-12 items-center justify-center rounded-lg border border-line font-semibold"
        >
          Sign in to see everyone&apos;s picks
        </Link>
      );
    }

    if (view.player) {
      const [{ data: rows, error }, { data: picked }] = await Promise.all([
        board().eq("user_id", view.player),
        supabase
          .from("predictions")
          .select("team_order")
          .eq("season_id", league.season_id)
          .eq("user_id", view.player)
          .maybeSingle(),
      ]);
      if (error) throw new Error(error.message);
      const row = ((rows ?? []) as BoardRow[])[0];
      const order = picked?.team_order as string[] | undefined;
      const back = (
        <Link href={`${path}?tab=picks`} className="-my-2 py-2 text-sm font-semibold text-muted">
          ‹ All players
        </Link>
      );
      if (!row || !order) {
        return (
          <div className="flex flex-col gap-2">
            {back}
            <p className="text-muted">We couldn&apos;t find that player&apos;s picks in this league.</p>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          {back}
          <h2 className="font-display text-2xl font-bold break-words">
            {row.user_id === userId ? "Your picks" : `${row.display_name}'s picks`}
          </h2>
          {row.rank !== null && (
            <p className="text-muted">
              {ordinal(row.rank)} · {points(row)} · {row.exact_count} exact
            </p>
          )}
          <ZoneLegend zones={zones} total={teams.length} />
          <LeagueTable
            teams={teamsInOrder(order, teams)}
            zones={zones}
            aside={
              actualOrder
                ? (team, position) => (
                    <PositionNote
                      label="Now"
                      position={actualOrder.indexOf(team.id) + 1}
                      exact={actualOrder[position - 1] === team.id}
                    />
                  )
                : undefined
            }
          />
        </div>
      );
    }

    const rows = await pageRows();
    return (
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-muted">
            {view.page > 1 ? "There's nobody on this page." : `Nobody got a prediction in for this ${noun}.`}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">Choose a player to see their predicted table.</p>
            <ul className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <PlayerRow
                  key={row.user_id}
                  row={row}
                  href={`${path}?tab=picks&player=${row.user_id}`}
                  isViewer={row.user_id === userId}
                  showScores={false}
                />
              ))}
            </ul>
          </>
        )}
        <Pager path={path} tab="picks" page={view.page} total={rows[0]?.entry_count ?? 0} />
      </div>
    );
  }

  const sharedNote = league.competition_id ? "This applies to every league and group playing this season." : undefined;

  return (
    <>
      {canUpdate && !finished && (
        <div className={`grid gap-2 ${latest ? "grid-cols-2" : ""}`}>
          <Link
            href={`${path}/standings`}
            className="flex h-12 items-center justify-center rounded-lg bg-accent font-semibold text-accent-ink"
          >
            Update standings
          </Link>
          {latest && <SeasonControl seasonId={league.season_id} action="finish" sharedNote={sharedNote} />}
        </div>
      )}
      {canReopen && finished && (
        <SeasonControl seasonId={league.season_id} action="reopen" sharedNote={sharedNote} />
      )}

      {winners.length > 0 && (
        <section aria-label="Winner" className="rounded-lg border border-accent bg-surface p-4 text-center">
          <p className="text-sm font-semibold text-muted">
            {winners.length > 1 ? "Joint winners" : "Winner"}
          </p>
          <p className="font-display text-3xl font-bold break-words">
            <span aria-hidden="true">🏆 </span>
            {winners.map((row) => row.display_name).join(", ")}
          </p>
          <p className="text-muted">{points(winners[0])}</p>
        </section>
      )}

      {ownRow && (
        <section aria-label="Your position" className="rounded-lg border border-line bg-surface p-4">
          {ownRow.rank === null ? (
            <p>
              <span className="font-semibold">Your prediction is locked in.</span>{" "}
              <span className="text-muted">Good luck!</span>
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-4xl font-bold">{ordinal(ownRow.rank)}</p>
                <p className="text-sm text-muted">
                  of {ownRow.entry_count} {ownRow.entry_count === 1 ? "player" : "players"}{" "}
                  <span className="font-semibold">
                    <Movement row={ownRow} />
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-4xl font-bold tabular-nums">{ownRow.total_points}</p>
                <p className="text-sm text-muted">{finished ? "final points" : "points so far"}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <TabNav label="League views" current={view.tab} options={tabs} />

      {view.tab === "table" ? tableTab() : view.tab === "picks" ? await picksTab() : await leaderboardTab()}
    </>
  );
}

export function readLiveView(params: {
  tab?: string | string[];
  player?: string | string[];
  page?: string | string[];
}): LiveView {
  const tab = params.tab === "table" || params.tab === "picks" ? params.tab : "leaderboard";
  const player = typeof params.player === "string" && UUID.test(params.player) ? params.player : null;
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  return { tab, player, page: Number.isInteger(page) && page > 0 ? page : 1 };
}
