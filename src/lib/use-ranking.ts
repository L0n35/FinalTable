"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { arrayMove } from "@dnd-kit/helpers";

export const sameOrder = (a: string[], b: string[] | null) =>
  b !== null && a.length === b.length && a.every((id, index) => id === b[index]);

// Moves between places animate when the browser can, and apply instantly otherwise.
function withTransition(update: () => void) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !("startViewTransition" in document)) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

export function buzz() {
  if ("vibrate" in navigator) navigator.vibrate(10);
}

// The order, tap-to-place selection and undo history behind a ranking list.
export function useRanking({
  initial,
  resetTo,
  resetMessage,
  nameOf,
}: {
  initial: () => string[];
  resetTo: string[];
  resetMessage: string;
  nameOf: (id: string) => string;
}) {
  const [order, setOrder] = useState(initial);
  const [past, setPast] = useState<string[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

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
    setAnnouncement(resetMessage);
    withTransition(() => {
      changeOrder(resetTo);
      setSelectedId(null);
    });
  };

  return {
    order,
    selectedId,
    setSelectedId,
    announcement,
    canUndo: past.length > 0,
    changeOrder,
    place,
    undo,
    reset,
  };
}
