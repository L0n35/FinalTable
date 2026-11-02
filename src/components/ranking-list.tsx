"use client";

import { useMemo } from "react";
import { Accessibility, KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { TeamBadge } from "@/components/team-badge";
import type { Team, Zones } from "@/lib/demo-league";
import { zoneFor, type Zone } from "@/lib/zones";

// dnd-kit delays touch drags by 250ms by default. Drags only start from the
// handle here, so there is no scroll gesture to disambiguate and it can lift at once.
const sensors = [
  PointerSensor.configure({
    activatorElements: (source) => [source.handle],
    activationConstraints: () => undefined,
  }),
  KeyboardSensor,
];

type AccessibilityOptions = NonNullable<ConstructorParameters<typeof Accessibility>[1]>;

const zoneStyles: Record<NonNullable<Zone>, string> = {
  promotion: "bg-promotion/15 text-promotion",
  playoff: "bg-playoff/15 text-playoff",
  relegation: "bg-relegation/15 text-relegation",
};

type RankingListProps = {
  teams: Team[];
  order: string[];
  zones: Zones;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (order: string[]) => void;
  onPlace: (id: string, index: number) => void;
};

export function RankingList({
  teams,
  order,
  zones,
  selectedId,
  onSelect,
  onDrop,
  onPlace,
}: RankingListProps) {
  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  const plugins = useMemo(() => {
    const nameOf = (id: unknown) => teamsById.get(String(id))?.name ?? "Team";
    const options: AccessibilityOptions = {
      screenReaderInstructions: {
        draggable:
          "Press Space to pick up this team. Use the up and down arrow keys to move it, Space to drop it, or Escape to cancel.",
      },
      announcements: {
        dragstart: ({ operation: { source } }) =>
          source ? `Picked up ${nameOf(source.id)}.` : undefined,
        dragover: ({ operation: { source } }) =>
          source && isSortable(source)
            ? `${nameOf(source.id)} is at position ${source.index + 1}.`
            : undefined,
        dragend: ({ operation: { source }, canceled }) => {
          if (!source) return undefined;
          if (canceled) return `Move cancelled. ${nameOf(source.id)} returned to its place.`;
          return isSortable(source)
            ? `${nameOf(source.id)} dropped at position ${source.index + 1}.`
            : undefined;
        },
      },
    };
    const accessibility = Accessibility.configure(options);
    return <T,>(defaults: T[]) =>
      defaults.map((plugin) =>
        plugin === (Accessibility as unknown) ? (accessibility as unknown as T) : plugin,
      );
  }, [teamsById]);

  return (
    <DragDropProvider
      sensors={sensors}
      plugins={plugins}
      onDragStart={() => onSelect(null)}
      onDragEnd={(event) => {
        if (event.canceled) return;
        onDrop(move(order, event));
      }}
    >
      <div className="relative">
        {/* Positions and zones stay fixed while the teams move through them. */}
        <ol
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col gap-1.5"
        >
          {order.map((_, index) => {
            const zone = zoneFor(index + 1, order.length, zones);
            return (
              <li
                key={index}
                className={`flex h-14 items-center rounded-lg ${zone ? zoneStyles[zone] : "text-muted"}`}
              >
                <span className="w-10 text-center font-display text-xl font-bold tabular-nums">
                  {index + 1}
                </span>
              </li>
            );
          })}
        </ol>
        <ul className="relative ml-10 flex flex-col gap-1.5">
          {order.map((id, index) => {
            const team = teamsById.get(id);
            if (!team) return null;
            return (
              <RankingRow
                key={id}
                team={team}
                index={index}
                selectedName={selectedId ? teamsById.get(selectedId)?.name : undefined}
                isSelected={selectedId === id}
                onTap={() => {
                  if (selectedId === id) onSelect(null);
                  else if (selectedId) onPlace(selectedId, index);
                  else onSelect(id);
                }}
              />
            );
          })}
        </ul>
      </div>
    </DragDropProvider>
  );
}

type RankingRowProps = {
  team: Team;
  index: number;
  selectedName: string | undefined;
  isSelected: boolean;
  onTap: () => void;
};

function RankingRow({ team, index, selectedName, isSelected, onTap }: RankingRowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: team.id, index });
  const position = index + 1;

  let label = `${team.name}, position ${position}. Select to move.`;
  if (isSelected) label = `${team.name}, position ${position}. Selected. Tap to cancel.`;
  else if (selectedName) label = `Move ${selectedName} to position ${position}.`;

  return (
    <li
      ref={ref}
      style={{ viewTransitionName: `team-${team.id}` }}
      className={`flex h-14 items-center rounded-lg border bg-surface transition-colors ${
        isSelected
          ? "border-accent bg-surface-raised"
          : isDragging
            ? "border-accent bg-surface-raised shadow-2xl shadow-black"
            : selectedName
              ? "border-dashed border-muted"
              : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        aria-pressed={isSelected}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-l-lg pl-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        <TeamBadge team={team} />
        <span className="truncate font-medium">{team.name}</span>
      </button>
      <button
        type="button"
        ref={handleRef}
        aria-label={`Drag ${team.name}`}
        className="drag-handle flex h-full w-12 shrink-0 cursor-grab items-center justify-center rounded-r-lg text-muted focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <rect x="3" y="5" width="14" height="2" rx="1" />
          <rect x="3" y="9" width="14" height="2" rx="1" />
          <rect x="3" y="13" width="14" height="2" rx="1" />
        </svg>
      </button>
    </li>
  );
}
