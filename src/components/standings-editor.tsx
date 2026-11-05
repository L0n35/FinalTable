"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateStandings } from "@/app/leagues/actions";
import { ActiveRanking, TableTabs, useActiveTable } from "@/components/ranking-tables";
import { groupedOrder, type Division } from "@/lib/divisions";
import type { Team, Zones } from "@/lib/leagues";
import { sameOrder, useRanking } from "@/lib/use-ranking";

type StandingsEditorProps = {
  seasonId: string;
  leagueName: string;
  leaguePath: string;
  teams: Team[];
  divisions: Division[];
  zones: Zones;
  // Empty until the first update, when the table starts in alphabetical order.
  saved: string[] | null;
  note: string;
};

export function StandingsEditor({
  seasonId,
  leagueName,
  leaguePath,
  teams,
  divisions,
  zones,
  saved,
  note,
}: StandingsEditorProps) {
  const router = useRouter();
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const startOrder = useMemo(
    () =>
      groupedOrder(
        saved ?? [...teams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => team.id),
        teams,
        divisions,
      ),
    [saved, teams, divisions],
  );
  const { order, selectedId, setSelectedId, announcement, canUndo, changeOrder, place, undo, reset } =
    useRanking({
      initial: () => startOrder,
      resetTo: startOrder,
      resetMessage: "Back to the last saved table.",
      nameOf: (id) => teamsById.get(id)?.name ?? "Team",
    });
  const { tables, active, show } = useActiveTable(order, teams, divisions, () => setSelectedId(null));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUnchanged = sameOrder(order, startOrder);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    const result = await updateStandings(seasonId, order).catch(() => ({
      ok: false as const,
      error: "We couldn't reach the server, so this isn't saved yet. Please try again.",
    }));
    // Visited pages stay alive when hidden, so this screen must be ready for the next visit.
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(leaguePath);
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="sticky top-0 z-10 border-b border-line bg-background px-4 pt-[max(12px,env(safe-area-inset-top))] pb-1">
        <h1 className="flex min-w-0 items-baseline gap-2 font-display text-2xl font-bold">
          <Link href={leaguePath} aria-label="Go back" className="-my-2 -ml-1 px-1 py-2">
            ‹
          </Link>
          <span className="truncate">Update standings</span>
        </h1>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted">{leagueName}</p>
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
              disabled={isUnchanged}
              className="h-11 px-2 text-sm font-semibold disabled:text-muted/50"
            >
              Reset
            </button>
          </div>
        </div>
        <TableTabs tables={tables} active={active} onShow={show} />
      </header>

      <main className="px-4 pt-3 pb-32">
        <ActiveRanking
          active={active}
          order={order}
          teams={teams}
          zones={zones}
          selectedId={selectedId}
          onSelect={setSelectedId}
          changeOrder={changeOrder}
          place={place}
        />
        <p className="mt-4 text-center text-sm text-muted">{note}</p>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background">
        <div className="mx-auto max-w-lg px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {selectedId ? (
            <div className="flex h-13 items-center justify-between gap-3">
              <p className="min-w-0 truncate">
                <span className="font-semibold">{teamsById.get(selectedId)?.name}</span>
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
              {error && (
                <p role="alert" className="mb-2 text-center text-relegation">
                  {error}
                </p>
              )}
              {/* Saving the same table again would wipe everyone's rank movement. */}
              <button
                type="button"
                disabled={isSaving || (saved !== null && isUnchanged)}
                onClick={save}
                className="h-13 w-full rounded-lg bg-accent font-display text-xl font-bold text-accent-ink disabled:bg-surface-raised disabled:text-muted"
              >
                {isSaving ? "Saving…" : saved !== null && isUnchanged ? "No changes yet" : "Save table"}
              </button>
            </>
          )}
        </div>
      </footer>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
