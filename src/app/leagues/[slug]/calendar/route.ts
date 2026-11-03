import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar";
import { LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

// Reads with the visitor's own session, so a private league's deadline stays private.
export async function GET(request: NextRequest, { params }: RouteContext<"/leagues/[slug]/calendar">) {
  const { slug } = await params;
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("league_details")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  const league = data as unknown as LeagueRow | null;
  if (!league) return new Response("Not found", { status: 404 });

  const ics = buildIcs({
    // Stays the same, so adding it again after a deadline moves can replace the old event.
    uid: `${league.season_id}-deadline@final-table`,
    title: league.name,
    deadline: league.deadline,
    url: `${request.nextUrl.origin}/leagues/${league.slug}`,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Inline, because iPhones then offer to add it rather than saving a file.
      "Content-Disposition": 'inline; filename="final-table-deadline.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
