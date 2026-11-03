"use client";

import { useSyncExternalStore } from "react";
import { formatDeadline, formatShortDate } from "@/lib/leagues";

const subscribeToNothing = () => () => {};

// The server doesn't know the viewer's time zone, so it renders UTC until the browser takes over.
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const format = dateOnly ? formatShortDate : formatDeadline;
  const label = useSyncExternalStore(
    subscribeToNothing,
    () => format(iso),
    () => format(iso, "UTC"),
  );
  return <time dateTime={iso}>{label}</time>;
}
