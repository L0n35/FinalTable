import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isLocked, LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

export async function YourLeagues() {
  if (!isSupabaseConfigured) return null;

  const { supabase, userId } = await getSession();
  if (!userId) return null;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("league_id")
    .eq("user_id", userId);
  const leagueIds = (memberships ?? []).map((row) => row.league_id as string);
  if (leagueIds.length === 0) return null;

  const { data } = await supabase
    .from("leagues")
    .select(LEAGUE_COLUMNS)
    .in("id", leagueIds)
    .order("deadline");
  const leagues = (data ?? []) as unknown as LeagueRow[];
  if (leagues.length === 0) return null;

  return (
    <section aria-label="Your leagues" className="mt-4">
      <h2 className="mb-2 font-display text-xl font-bold">Your leagues</h2>
      <ul className="flex flex-col gap-2">
        {leagues.map((league) => (
          <li key={league.id}>
            <Link
              href={`/leagues/${league.slug}`}
              className="block rounded-lg border border-line bg-surface p-3"
            >
              <span className="block truncate font-semibold">{league.name}</span>
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
        ))}
      </ul>
    </section>
  );
}
