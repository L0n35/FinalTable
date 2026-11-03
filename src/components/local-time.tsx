"use client";

import { useSyncExternalStore } from "react";
import { formatDeadline } from "@/lib/leagues";

const subscribeToNothing = () => () => {};

// The server doesn't know the viewer's time zone, so it renders UTC until the browser takes over.
export function LocalTime({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    subscribeToNothing,
    () => formatDeadline(iso),
    () => formatDeadline(iso, "UTC"),
  );
  return <time dateTime={iso}>{label}</time>;
}
