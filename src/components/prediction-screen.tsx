"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { arrayMove } from "@dnd-kit/helpers";
import { RankingList } from "@/components/ranking-list";
import { Sheet } from "@/components/sheet";
import { TeamBadge } from "@/components/team-badge";
import { ZoneLegend } from "@/components/zone-legend";
import type { League } from "@/lib/demo-league";
import { readSavedOrder, writeSavedOrder } from "@/lib/saved-order";

const sameOrder = (a: string[], b: string[] | null) =>
  b !== null && a.length === b.length && a.every((id, index) => id === b[index]);

function timeLeft(deadline: number, now: number) {
  const minutes = Math.max(0, Math.floor((deadline - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}

// Moves between places animate when the browser can, and apply instantly otherwise.
function withTransition(update: () => void) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !("startViewTransition" in document)) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

function buzz() {
  if ("vibrate" in navigator) navigator.vibrate(10);
}

export function PredictionScreen({ league }: { league: League }) {
  const draftKey = `final-table:draft:${league.id}`;
  const submittedKey = `final-table:submitted:${league.id}`;

  const alphabetical = useMemo(
    () =>
      [...league.teams]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((team) => team.id),
    [league.teams],
  );
  const teamsById = useMemo(
    () => new Map(league.teams.map((team) => [team.id, team])),
    [league.teams],
  );

  const [submitted, setSubmitted] = useState(() => readSavedOrder(submittedKey, alphabetical));
  const [order, setOrder] = useState(
    () => readSavedOrder(draftKey, alphabetical) ?? submitted ?? alphabetical,
  );
  const [past, setPast] = useState<string[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"confirm" | "success" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    writeSavedOrder(draftKey, order);
  }, [draftKey, order]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const nameOf = (id: string) => teamsById.get(id)?.name ?? "Team";

  const changeOrder = (next: string[]) => {
    if (sameOrder(next, order)) return;
    setPast((history) => [...history, order]);
    setOrder(next);
    buzz();
  };

  const place = (id: string, index: number) => {
    setAnnouncement(`${nameOf(id)} moved to position ${index + 1}.`);
    withTransition(() => {
      changeOrder(arrayMove(order, order.indexOf(id), index));
      setSelectedId(null);
    });
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setAnnouncement("Last move undone.");
    withTransition(() => {
      setPast(past.slice(0, -1));
      setOrder(previous);
      setSelectedId(null);
    });
  };

  const reset = () => {
    setAnnouncement("Reset to alphabetical order.");
    withTransition(() => {
      changeOrder(alphabetical);
      setSelectedId(null);
    });
  };

  const submit = () => {
    writeSavedOrder(submittedKey, order);
    setSubmitted(order);
    setSheet("success");
    buzz();
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${league.name} on Final Table`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // Closing the share dialog rejects, and there is nothing to report.
    }
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
  const champion = teamsById.get(order[0]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="sticky top-0 z-10 border-b border-line bg-background px-4 pt-[max(12px,env(safe-area-inset-top))] pb-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="truncate font-display text-2xl font-bold">{league.name}</h1>
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
              disabled={past.length === 0}
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
      </header>

      <main className="px-4 pt-3 pb-32">
        <ZoneLegend zones={league.zones} total={order.length} />

        <RankingList
          teams={league.teams}
          order={order}
          zones={league.zones}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDrop={changeOrder}
          onPlace={place}
        />

        <p className="mt-4 text-center text-sm text-muted">Locks {deadlineLabel}</p>
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
            <button
              type="button"
              disabled={isSubmitted}
              onClick={() => (isAlphabetical ? setSheet("confirm") : submit())}
              className="h-13 w-full rounded-lg bg-accent font-display text-xl font-bold text-accent-ink disabled:bg-surface-raised disabled:text-muted"
            >
              {isSubmitted
                ? "Prediction submitted ✓"
                : submitted
                  ? "Update prediction"
                  : "Submit prediction"}
            </button>
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
        <h2 className="font-display text-2xl font-bold">Still in alphabetical order</h2>
        <p className="mt-1 text-muted">
          You haven&apos;t moved any teams yet. Submit this table anyway?
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSheet(null)}
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
        {champion && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <TeamBadge team={champion} />
            <p>
              <span className="block text-sm text-muted">Your champion</span>
              <span className="font-semibold">{champion.name}</span>
            </p>
          </div>
        )}
        <p className="mt-3 text-center text-sm text-muted">
          You can change your prediction until {deadlineLabel}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={share}
            className="h-12 rounded-lg border border-line font-semibold"
          >
            {copied ? "Link copied" : "Share league"}
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
