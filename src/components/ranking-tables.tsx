"use client";

import { useState } from "react";
import { RankingList } from "@/components/ranking-list";
import { ZoneLegend } from "@/components/zone-legend";
import { tablesOf, withTable, type Division, type TableOrder } from "@/lib/divisions";
import type { Team, Zones } from "@/lib/leagues";
import { sameOrder } from "@/lib/use-ranking";

// Which conference's table is on show. A season with no conferences always shows its one table.
export function useActiveTable(order: string[], teams: Team[], divisions: Division[], onShow: () => void) {
  const tables = tablesOf(order, teams, divisions);
  const [activeId, setActiveId] = useState<string | null>(divisions[0]?.id ?? null);
  const [seenOrder, setSeenOrder] = useState(order);

  // Undo and Reset can change a table that isn't on show, so the screen follows the change there.
  if (order !== seenOrder) {
    setSeenOrder(order);
    const before = tablesOf(seenOrder, teams, divisions);
    const changed = tables.filter((table, index) => !sameOrder(table.order, before[index].order));
    if (divisions.length > 0 && changed.length > 0 && !changed.some((table) => table.division?.id === activeId)) {
      setActiveId(changed[0].division?.id ?? null);
    }
  }

  const show = (id: string) => {
    setActiveId(id);
    onShow();
  };

  return { tables, active: tables.find((table) => table.division?.id === activeId) ?? tables[0], show };
}

export function TableTabs({
  tables,
  active,
  onShow,
  isDone,
}: {
  tables: TableOrder[];
  active: TableOrder;
  onShow: (id: string) => void;
  isDone?: (table: TableOrder) => boolean;
}) {
  if (tables.length < 2) return null;
  return (
    <div role="group" aria-label="Conferences" className="mb-2 flex gap-1 rounded-lg bg-surface p-1">
      {tables.map((table) => {
        const division = table.division;
        if (!division) return null;
        const isActive = active.division?.id === division.id;
        const done = isDone?.(table) ?? false;
        return (
          <button
            key={division.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onShow(division.id)}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-center font-semibold ${
              isActive ? "bg-surface-raised text-foreground" : "text-muted"
            }`}
          >
            {division.name}
            {done && (
              <span className="text-promotion">
                <span aria-hidden="true">✓</span>
                <span className="sr-only">, moved</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// The table on show, ready to rank. A move only ever changes this table's teams.
export function ActiveRanking({
  active,
  order,
  teams,
  zones,
  selectedId,
  onSelect,
  changeOrder,
  place,
}: {
  active: TableOrder;
  order: string[];
  teams: Team[];
  zones: Zones;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  changeOrder: (order: string[]) => void;
  place: (id: string, index: number, position?: number) => void;
}) {
  return (
    <>
      <ZoneLegend zones={zones} total={active.order.length} />
      <RankingList
        key={active.division?.id ?? "table"}
        teams={teams}
        order={active.order}
        zones={zones}
        selectedId={selectedId}
        onSelect={onSelect}
        onDrop={(next) => changeOrder(withTable(order, next))}
        onPlace={(id, index) => place(id, order.indexOf(active.order[index]), index + 1)}
      />
    </>
  );
}
