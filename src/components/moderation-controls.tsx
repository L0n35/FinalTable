"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLeague,
  dismissReport,
  removeTeamLogo,
  resolveReports,
  setLeagueHidden,
} from "@/app/leagues/actions";

type Outcome = { ok: true } | { ok: false; error: string };

function useModeration() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (work: () => Promise<Outcome>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await work().catch(
        (): Outcome => ({ ok: false, error: "We couldn't reach the server. Please try again." }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (after) after();
      router.refresh();
    });
  };
  return { error, isPending, run, router };
}

const buttonClass = "h-11 rounded-lg border border-line px-3 font-semibold disabled:opacity-60";

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-relegation">
      {error}
    </p>
  ) : null;
}

// On a league page, for admins.
export function LeagueModeration({
  leagueId,
  isHidden,
  isOfficial,
}: {
  leagueId: string;
  isHidden: boolean;
  isOfficial: boolean;
}) {
  const { error, isPending, run, router } = useModeration();

  const toggle = () => {
    if (!isHidden && !window.confirm("Hide this league? Its players won't be able to open it.")) return;
    run(() => setLeagueHidden(leagueId, !isHidden));
  };
  const remove = () => {
    const warning = isOfficial
      ? "Permanently delete this official league, its season and all predictions? This can't be undone."
      : "Permanently delete this league? This can't be undone.";
    if (!window.confirm(warning)) return;
    run(
      () => deleteLeague(leagueId),
      () => router.replace("/admin"),
    );
  };

  return (
    <section aria-label="Admin controls" className="rounded-lg border border-line p-3">
      <h2 className="mb-2 text-sm font-semibold text-muted">Admin controls</h2>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={toggle} disabled={isPending} className={buttonClass}>
          {isHidden ? "Unhide league" : "Hide league"}
        </button>
        <button type="button" onClick={remove} disabled={isPending} className={`${buttonClass} text-relegation`}>
          Delete league
        </button>
      </div>
      <ErrorLine error={error} />
    </section>
  );
}

// In the review queue, for all the open reports on one league.
export function ReportActions({ leagueId, reportCount }: { leagueId: string; reportCount: number }) {
  const { error, isPending, run } = useModeration();

  const hide = () => {
    if (!window.confirm("Hide this league? Its players won't be able to open it.")) return;
    run(() => resolveReports(leagueId, true));
  };

  return (
    <div>
      <div className={`grid gap-2 ${reportCount > 1 ? "grid-cols-2" : ""}`}>
        {reportCount > 1 && (
          <button
            type="button"
            onClick={() => run(() => resolveReports(leagueId, false))}
            disabled={isPending}
            className={buttonClass}
          >
            Dismiss all
          </button>
        )}
        <button type="button" onClick={hide} disabled={isPending} className={`${buttonClass} text-relegation`}>
          Hide league
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

// For one report. A logo can only be removed from a report about that logo.
export function SingleReportActions({
  reportId,
  logoTeam,
}: {
  reportId: string;
  logoTeam?: { id: string; name: string };
}) {
  const { error, isPending, run } = useModeration();

  const removeLogo = (team: { id: string; name: string }) => {
    if (!window.confirm(`Remove the logo for ${team.name}? The team goes back to its badge.`)) return;
    run(() => removeTeamLogo(team.id));
  };

  return (
    <div className="mt-2">
      <div className={`grid gap-2 ${logoTeam ? "grid-cols-2" : ""}`}>
        <button
          type="button"
          onClick={() => run(() => dismissReport(reportId))}
          disabled={isPending}
          className={buttonClass}
        >
          Dismiss
        </button>
        {logoTeam && (
          <button
            type="button"
            onClick={() => removeLogo(logoTeam)}
            disabled={isPending}
            className={`${buttonClass} text-relegation`}
          >
            Remove logo
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function UnhideButton({ leagueId }: { leagueId: string }) {
  const { error, isPending, run } = useModeration();
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => run(() => setLeagueHidden(leagueId, false))}
        disabled={isPending}
        className={buttonClass}
      >
        Unhide
      </button>
      <ErrorLine error={error} />
    </div>
  );
}
