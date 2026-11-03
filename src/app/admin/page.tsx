import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageFallback, PageShell } from "@/components/page-shell";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { LEAGUE_COLUMNS, type LeagueRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "Official leagues | Final Table" };

async function Admin() {
  const session = await getSession();
  if (!session.userId) redirect("/login?next=/admin");
  if (!(await isCurrentUserAdmin(session))) notFound();

  const [{ data }, { data: openReports }] = await Promise.all([
    session.supabase
      .from("league_details")
      .select(LEAGUE_COLUMNS)
      .eq("type", "official")
      .order("deadline", { ascending: false }),
    session.supabase.from("reports").select("id").eq("status", "open").limit(100),
  ]);
  const reportCount = openReports?.length ?? 0;
  const leagues = (data ?? []) as unknown as LeagueRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-4xl font-bold">Admin</h1>
      <Link
        href="/admin/reports"
        className="flex h-13 items-center justify-between rounded-lg border border-line px-4 font-semibold"
      >
        <span>Reports</span>
        <span className={reportCount > 0 ? "text-accent" : "text-muted"}>
          {reportCount === 100 ? "100+" : reportCount} open
        </span>
      </Link>
      <h2 className="font-display text-2xl font-bold">Official leagues</h2>
      <Link
        href="/leagues/new?kind=official"
        className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
      >
        New official league
      </Link>
      {leagues.length === 0 ? (
        <p className="text-muted">No official leagues yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{league.name}</span>
                  <span className="block text-sm text-muted">{league.sport}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-muted capitalize">
                  {league.hidden_at ? "Hidden" : league.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <Admin />
      </Suspense>
    </PageShell>
  );
}
