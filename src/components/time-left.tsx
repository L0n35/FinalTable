"use client";

import { useSyncExternalStore } from "react";
import { formatShortDate, timeLeft } from "@/lib/leagues";

const subscribeToClock = (onChange: () => void) => {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
};

// Worked out in the browser, so a page cached for everyone still counts down. A cached page can also
// outlive a deadline, so this has to cope with one that's passed.
export function TimeLeft({ iso, className }: { iso: string; className?: string }) {
  const label = useSyncExternalStore(
    subscribeToClock,
    () => {
      const deadline = new Date(iso).getTime();
      const now = Date.now();
      return now >= deadline ? "Predictions closed" : timeLeft(deadline, now);
    },
    () => `Locks ${formatShortDate(iso, "UTC")}`,
  );
  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}
