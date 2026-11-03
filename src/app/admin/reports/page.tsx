import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { RemoveLogoButton, ReportActions, UnhideButton } from "@/components/moderation-controls";
import { PageFallback, PageShell } from "@/components/page-shell";
import { TeamBadge } from "@/components/team-badge";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { LEAGUE_COLUMNS, TEAM_COLUMNS, toTeam, type LeagueRow, type TeamRow } from "@/lib/leagues";

export const metadata: Metadata = { title: "Reports | Final Table" };

const QUEUE_LIMIT = 100;

type ReportRow = {
  id: string;
  league_id: string;
  team_id: string | null;
  reported_by: string | null;
  reason: string;
  created_at: string;
};

async function Reports() {
  const session = await getSession();
  const { supabase, userId } = session;
  if (!userId) redirect("/login?next=/admin/reports");
  if (!(await isCurrentUserAdmin(session))) notFound();

  const [reportResult, hiddenResult] = await Promise.all([
    supabase
      .from("reports")
      .select("id, league_id, team_id, reported_by, reason, created_at")
      .eq("status", "open")
      .order("created_at")
      .limit(QUEUE_LIMIT),
    supabase.from("league_details").select(LEAGUE_COLUMNS).not("hidden_at", "is", null),
  ]);
  // Shown on the error page, rather than looking like an empty queue.
  const readError = reportResult.error ?? hiddenResult.error;
  if (readError) throw new Error(readError.message);

  const reports = (reportResult.data ?? []) as ReportRow[];
  const hidden = (hiddenResult.data ?? []) as unknown as LeagueRow[];

  const unique = (values: (string | null)[]) => [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
  const leagueIds = unique(reports.map((report) => report.league_id));
  const [{ data: leagueRows }, { data: teamRows }, { data: profileRows }] = await Promise.all([
    supabase.from("league_details").select(LEAGUE_COLUMNS).in("id", leagueIds),
    supabase.from("teams").select(TEAM_COLUMNS).in("id", unique(reports.map((report) => report.team_id))),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", unique(reports.map((report) => report.reported_by))),
  ]);
  const leagues = new Map(((leagueRows ?? []) as unknown as LeagueRow[]).map((league) => [league.id, league]));
  const teams = new Map(((teamRows ?? []) as TeamRow[]).map((team) => [team.id, team]));
  const names = new Map((profileRows ?? []).map((row) => [row.id as string, row.display_name as string]));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="-my-2 py-2 text-sm font-semibold text-muted">
        ‹ Admin
      </Link>
      <h1 className="font-display text-4xl font-bold">Reports</h1>

      {reports.length === 0 && <p className="text-muted">Nothing to review.</p>}

      {leagueIds.map((leagueId) => {
        const league = leagues.get(leagueId);
        return (
          <section
            key={leagueId}
            aria-label={league?.name ?? "League"}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3"
          >
            <div>
              {league ? (
                <Link href={`/leagues/${league.slug}`} className="block font-semibold break-words underline">
                  {league.name}
                </Link>
              ) : (
                <p className="font-semibold">League</p>
              )}
              {league && <p className="text-sm text-muted capitalize">{league.type} league</p>}
            </div>
            <ul className="flex flex-col gap-3">
              {reports
                .filter((report) => report.league_id === leagueId)
                .map((report) => {
                  const team = report.team_id ? teams.get(report.team_id) : undefined;
                  return (
                    <li key={report.id} className="border-t border-line pt-3">
                      {team && (
                        <div className="mb-2 flex items-center gap-2">
                          <TeamBadge team={toTeam(team)} />
                          <span className="min-w-0 truncate font-semibold">{team.name}</span>
                        </div>
                      )}
                      <p className="break-words whitespace-pre-wrap">{report.reason}</p>
                      <p className="mt-1 text-sm text-muted">
                        {(report.reported_by && names.get(report.reported_by)) || "Someone"},{" "}
                        <LocalTime iso={report.created_at} />
                      </p>
                      {team?.logo_path && <RemoveLogoButton teamId={team.id} teamName={team.name} />}
                    </li>
                  );
                })}
            </ul>
            <ReportActions leagueId={leagueId} />
          </section>
        );
      })}

      <section aria-label="Hidden leagues" className="mt-2">
        <h2 className="mb-2 font-display text-2xl font-bold">Hidden leagues</h2>
        {hidden.length === 0 ? (
          <p className="text-muted">No leagues are hidden.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hidden.map((league) => (
              <li
                key={league.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <Link href={`/leagues/${league.slug}`} className="min-w-0 truncate font-semibold underline">
                  {league.name}
                </Link>
                <UnhideButton leagueId={league.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <Reports />
      </Suspense>
    </PageShell>
  );
}
