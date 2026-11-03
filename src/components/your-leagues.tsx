import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isLocked, LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

export async function YourLeagues() {
  if (!isSupabaseConfigured) return null;

  const { supabase, userId } = await getSession();
  if (!userId) return null;

  // Based on membership, so an official league an admin created isn't "theirs" unless they joined it.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("league_id")
    .eq("user_id", userId);
  const leagueIds = (memberships ?? []).map((row) => row.league_id as string);
  if (leagueIds.length === 0) return null;

  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .in("id", leagueIds)
    .order("deadline");
  const leagues = (data ?? []) as unknown as LeagueRow[];
  if (leagues.length === 0) return null;

  const { data: predictions } = await supabase
    .from("predictions")
    .select("season_id, needs_review")
    .eq("user_id", userId);
  const predictionFor = new Map(
    (predictions ?? []).map((row) => [row.season_id as string, row.needs_review as boolean]),
  );

  const statusOf = (league: LeagueRow) => {
    if (league.status === "draft") return null;
    if (league.status === "finished") return { label: "Finished", urgent: false };
    if (isLocked(league)) return { label: "Live", urgent: false };
    const needsReview = predictionFor.get(league.season_id);
    if (needsReview === undefined) return { label: "Prediction needed", urgent: true };
    return needsReview
      ? { label: "Review needed", urgent: true }
      : { label: "Submitted", urgent: false };
  };

  return (
    <section aria-label="Your leagues" className="mt-4">
      <h2 className="mb-2 font-display text-xl font-bold">Your leagues</h2>
      <ul className="flex flex-col gap-2">
        {leagues.map((league) => {
          const status = statusOf(league);
          return (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.slug}`}
                className="block rounded-lg border border-line bg-surface p-3"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{league.name}</span>
                  {status && (
                    <span
                      className={`shrink-0 text-sm font-semibold ${status.urgent ? "text-accent" : "text-muted"}`}
                    >
                      {status.label}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-muted">
                  {league.status === "draft" ? (
                    "Draft"
                  ) : (
                    <>
                      {isLocked(league) ? "Started " : "Locks "}
                      <LocalTime iso={league.deadline} />
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
