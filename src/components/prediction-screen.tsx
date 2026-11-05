"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarLinks } from "@/components/calendar-links";
import { LeagueTables } from "@/components/league-tables";
import { ActiveRanking, TableTabs, useActiveTable } from "@/components/ranking-tables";
import { Sheet } from "@/components/sheet";
import { TeamBadge } from "@/components/team-badge";
import { copyText } from "@/lib/browser-utils";
import type { League } from "@/lib/demo-league";
import { groupedOrder, listNames, tablesOf, type Division } from "@/lib/divisions";
import { timeLeft } from "@/lib/leagues";
import {
  clearSavedOrder,
  isSavedOrderOlderThan,
  readSavedOrder,
  reconcileOrder,
  writeSavedOrder,
} from "@/lib/saved-order";
import { buzz, sameOrder, useRanking } from "@/lib/use-ranking";

const NO_DIVISIONS: Division[] = [];

export type SavePrediction = (
  leagueId: string,
  order: string[],
) => Promise<{ ok: true } | { ok: false; error: string; closed?: boolean }>;

type PredictionScreenProps = {
  league: League;
  // Without save, the screen is the demo and keeps submissions on this device.
  save?: SavePrediction;
  initialSubmitted?: string[] | null;
  submittedAt?: string | null;
  needsReview?: boolean;
  // Keeps drafts apart when two people share a device.
  userId?: string;
  backHref?: string;
  sharePath?: string;
  // Offers the deadline as a calendar event. The demo has no real deadline to add.
  calendarHref?: string;
  note?: string;
};

export function PredictionScreen({
  league,
  save,
  initialSubmitted = null,
  submittedAt = null,
  needsReview = false,
  userId,
  backHref,
  sharePath,
  calendarHref,
  note,
}: PredictionScreenProps) {
  const scope = userId ? `${league.id}:${userId}` : league.id;
  const draftKey = `final-table:draft:${scope}`;
  const submittedKey = `final-table:submitted:${scope}`;

  const divisions = league.divisions ?? NO_DIVISIONS;
  // Keeps each conference's teams together, so a table is always one unbroken block of the order.
  const grouped = (ids: string[]) => groupedOrder(ids, league.teams, divisions);

  const alphabetical = useMemo(
    () =>
      groupedOrder(
        [...league.teams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => team.id),
        league.teams,
        divisions,
      ),
    [league.teams, divisions],
  );
  const teamsById = useMemo(
    () => new Map(league.teams.map((team) => [team.id, team])),
    [league.teams],
  );

  const [submitted, setSubmitted] = useState(() => {
    if (!save) return readSavedOrder(submittedKey, alphabetical);
    return initialSubmitted && !needsReview ? grouped(initialSubmitted) : null;
  });
  const nameOf = (id: string) => teamsById.get(id)?.name ?? "Team";
  const { order, selectedId, setSelectedId, announcement, canUndo, changeOrder, place, undo, reset } =
    useRanking({
      initial: () => {
        const draft = readSavedOrder(draftKey, alphabetical);
        if (draft && !(submittedAt && isSavedOrderOlderThan(draftKey, submittedAt))) return grouped(draft);
        if (submitted) return submitted;
        return initialSubmitted ? grouped(reconcileOrder(initialSubmitted, alphabetical)) : alphabetical;
      },
      resetTo: alphabetical,
      resetMessage: "Reset to alphabetical order.",
      nameOf,
    });
  const { tables, active, show } = useActiveTable(order, league.teams, divisions, () => setSelectedId(null));
  const [sheet, setSheet] = useState<"confirm" | "success" | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reviewNeeded, setReviewNeeded] = useState(needsReview);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [closedByServer, setClosedByServer] = useState(false);

  useEffect(() => {
    if (sameOrder(order, submitted)) clearSavedOrder(draftKey);
    else writeSavedOrder(draftKey, order);
  }, [draftKey, order, submitted]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    // Lock on the dot, rather than up to 30 seconds late. Longer delays overflow setTimeout.
    const untilDeadline = new Date(league.deadline).getTime() - Date.now();
    const lock =
      untilDeadline > 0 && untilDeadline < 2 ** 31 - 1
        ? setTimeout(() => setNow(Date.now()), untilDeadline + 50)
        : undefined;
    return () => {
      clearInterval(timer);
      clearTimeout(lock);
    };
  }, [league.deadline]);

  const submit = async () => {
    setSaveError(null);
    if (save) {
      setSheet(null);
      setIsSaving(true);
      // A lost connection rejects rather than returning a result. The draft stays on the device.
      const result = await save(league.id, order).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server, so this isn't saved yet. Please try again.",
        closed: false,
      }));
      setIsSaving(false);
      if (!result.ok) {
        if (result.closed) setClosedByServer(true);
        else setSaveError(result.error);
        return;
      }
    } else {
      writeSavedOrder(submittedKey, order);
    }
    setSubmitted(order);
    setReviewNeeded(false);
    setSheet("success");
    buzz();
  };

  const share = async () => {
    const url = sharePath ? `${window.location.origin}${sharePath}` : window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${league.name} on Final Table`, url });
      } catch {
        // Closing the share dialog rejects, and there is nothing to report.
      }
      return;
    }
    setCopied(await copyText(url));
  };

  const deadline = new Date(league.deadline);
  const deadlineLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(deadline);

  const isSubmitted = sameOrder(order, submitted);
  const isAlphabetical = sameOrder(order, alphabetical);
  const alphabeticalTables = tablesOf(alphabetical, league.teams, divisions);
  const isUntouched = (table: (typeof tables)[number]) =>
    sameOrder(table.order, alphabeticalTables[tables.indexOf(table)]?.order ?? null);
  const untouched = tables.filter(isUntouched);
  const untouchedNames = listNames(untouched.flatMap((table) => (table.division ? [table.division.name] : [])));
  const topPicks = tables.flatMap((table) => {
    const team = teamsById.get(table.order[0]);
    return team ? [{ division: table.division, team }] : [];
  });

  if (closedByServer || now >= deadline.getTime()) {
    const finalOrder = submitted ?? [];
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
        <div>
          <h1 className="font-display text-3xl font-bold">Predictions have closed</h1>
          <p className="mt-1 text-muted">
            {finalOrder.length > 0
              ? "Your last submitted table stands. Any changes you hadn't submitted weren't saved."
              : "The deadline passed before you submitted a prediction."}
          </p>
        </div>
        {backHref && (
          <Link
            href={backHref}
            className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
          >
            Go back
          </Link>
        )}
        {finalOrder.length > 0 && (
          <LeagueTables order={finalOrder} teams={league.teams} divisions={divisions} zones={league.zones} />
        )}
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="sticky top-0 z-10 border-b border-line bg-background px-4 pt-[max(12px,env(safe-area-inset-top))] pb-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="flex min-w-0 items-baseline gap-2 font-display text-2xl font-bold">
            {backHref && (
              <Link href={backHref} aria-label="Go back" className="-my-2 -ml-1 px-1 py-2">
                ‹
              </Link>
            )}
            <span className="truncate">{league.name}</span>
          </h1>
          <p className="shrink-0 text-sm font-semibold text-accent tabular-nums">
            <time dateTime={league.deadline} title={deadlineLabel}>
              {timeLeft(deadline.getTime(), now)}
            </time>
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">Drag the handle, or tap a team</p>
          <div className="-mr-2 flex shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="h-11 px-2 text-sm font-semibold disabled:text-muted/50"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isAlphabetical}
              className="h-11 px-2 text-sm font-semibold disabled:text-muted/50"
            >
              Reset
            </button>
          </div>
        </div>
        <TableTabs tables={tables} active={active} onShow={show} isDone={(table) => !isUntouched(table)} />
      </header>

      <main className="px-4 pt-3 pb-32">
        {reviewNeeded && (
          <p role="status" className="mb-3 rounded-lg border border-accent bg-surface p-3">
            The teams have changed. Check your table, then submit it again to stay in the running.
          </p>
        )}
        <ActiveRanking
          active={active}
          order={order}
          teams={league.teams}
          zones={league.zones}
          selectedId={selectedId}
          onSelect={setSelectedId}
          changeOrder={changeOrder}
          place={place}
        />

        <p className="mt-4 text-center text-sm text-muted">Locks {deadlineLabel}</p>
        {note && <p className="mt-1 text-center text-sm text-muted">{note}</p>}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background">
        <div className="mx-auto max-w-lg px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {selectedId ? (
            <div className="flex h-13 items-center justify-between gap-3">
              <p className="min-w-0 truncate">
                <span className="font-semibold">{nameOf(selectedId)}</span>
                <span className="text-muted">: tap a new position</span>
              </p>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="h-11 shrink-0 rounded-lg border border-line px-4 font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {saveError && (
                <p role="alert" className="mb-2 text-center text-relegation">
                  {saveError}
                </p>
              )}
              <button
                type="button"
                disabled={isSubmitted || isSaving}
                onClick={() => (untouched.length > 0 ? setSheet("confirm") : submit())}
                className="h-13 w-full rounded-lg bg-accent font-display text-xl font-bold text-accent-ink disabled:bg-surface-raised disabled:text-muted"
              >
                {isSaving
                  ? "Saving…"
                  : isSubmitted
                    ? "Prediction submitted ✓"
                    : submitted
                      ? "Update prediction"
                      : "Submit prediction"}
              </button>
            </>
          )}
        </div>
      </footer>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Sheet
        open={sheet === "confirm"}
        label="Submit in alphabetical order?"
        onClose={() => setSheet((current) => (current === "confirm" ? null : current))}
      >
        <h2 className="font-display text-2xl font-bold">
          {untouchedNames ? `${untouchedNames} still in alphabetical order` : "Still in alphabetical order"}
        </h2>
        <p className="mt-1 text-muted">
          {untouchedNames
            ? `You haven't moved any ${untouchedNames} teams yet. Submit your prediction anyway?`
            : "You haven't moved any teams yet. Submit this table anyway?"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              const first = untouched[0]?.division;
              if (first) show(first.id);
            }}
            className="h-12 rounded-lg border border-line font-semibold"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-12 rounded-lg bg-accent font-semibold text-accent-ink"
          >
            Submit anyway
          </button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "success"}
        label="Prediction submitted"
        onClose={() => {
          setCopied(false);
          setSheet((current) => (current === "success" ? null : current));
        }}
      >
        <div className="pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl font-bold text-accent-ink">
          ✓
        </div>
        <h2 className="mt-3 text-center font-display text-3xl font-bold">You&apos;re in!</h2>
        {topPicks.map(({ division, team }) => (
          <div key={team.id} className="mt-3 flex items-center justify-center gap-3">
            <TeamBadge team={team} />
            <p>
              <span className="block text-sm text-muted">Your top pick{division ? `, ${division.name}` : ""}</span>
              <span className="font-semibold">{team.name}</span>
            </p>
          </div>
        ))}
        <p className="mt-3 text-center text-sm text-muted">
          You can change your prediction until {deadlineLabel}.
        </p>
        {calendarHref && (
          <div className="mt-4">
            <CalendarLinks title={league.name} deadline={league.deadline} icsHref={calendarHref} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={share}
            className="h-12 rounded-lg border border-line font-semibold"
          >
            {copied ? "Link copied" : "Invite friends"}
          </button>
          <button
            type="button"
            onClick={() => setSheet(null)}
            className="h-12 rounded-lg bg-accent font-semibold text-accent-ink"
          >
            Done
          </button>
        </div>
      </Sheet>
    </div>
  );
}
