import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { accentStyle, isLocked, LEAGUE_COLUMNS, surfaceFor, type LeagueRow } from "@/lib/leagues";

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
    if (league.hidden_at) return { label: "Hidden", urgent: true };
    if (league.status === "draft") return null;
    if (league.status === "finished") return { label: "Finished", urgent: false };
    if (isLocked(league)) return { label: "Live", urgent: false };
    const needsReview = predictionFor.get(league.season_id);
    if (needsReview === undefined) return { label: "Prediction needed", urgent: true };
    return needsReview
      ? { label: "Review needed", urgent: true }
      : { label: "Submitted", urgent: false };
  };

  // Anything needing action first and finished seasons last. The sort keeps deadline order within each.
  const priority = (league: LeagueRow) => {
    const status = statusOf(league);
    if (status?.urgent) return 0;
    return status?.label === "Finished" ? 2 : 1;
  };
  const ordered = [...leagues].sort((a, b) => priority(a) - priority(b));

  return (
    <section aria-label="Your leagues and groups">
      <h2 className="poster mb-3 text-3xl">Your leagues and groups</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {ordered.map((league) => {
          const status = statusOf(league);
          return (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.slug}`}
                style={accentStyle(league.competition_accent)}
                data-surface={surfaceFor(league.sport)}
                className="group-row block rounded-xl border border-line py-3 pr-3 pl-7"
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
