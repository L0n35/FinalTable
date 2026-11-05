"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NONE: ReadonlySet<string> = new Set();
const JoinedLeagues = createContext(NONE);

async function readJoined(): Promise<ReadonlySet<string>> {
  // Visitors with no session never reach the database from here, or download the client.
  if (!document.cookie.includes("-auth-token")) return NONE;
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return NONE;
  const { data } = await supabase
    .from("memberships")
    .select("league_id")
    .eq("user_id", sessionData.session.user.id);
  return new Set((data ?? []).map((row) => row.league_id as string));
}

// Loads in the browser, so the pages around it stay cached for everyone.
export function JoinedLeaguesProvider({ children }: { children: ReactNode }) {
  const [joined, setJoined] = useState(NONE);

  useEffect(() => {
    let active = true;
    readJoined()
      .then((ids) => {
        if (active) setJoined(ids);
      })
      // Only the ticks are missing if this fails.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return <JoinedLeagues.Provider value={joined}>{children}</JoinedLeagues.Provider>;
}

export function JoinedOr({
  leagueId,
  className = "font-semibold text-accent-on-turf",
  children,
}: {
  leagueId: string;
  className?: string;
  children: ReactNode;
}) {
  const joined = useContext(JoinedLeagues).has(leagueId);
  return joined ? <span className={className}>Joined ✓</span> : children;
}
