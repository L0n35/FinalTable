"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteLeague, publishLeague } from "@/app/leagues/actions";
import { LocalTime } from "@/components/local-time";
import { BasicsStep } from "@/components/wizard/basics-step";
import { FormError, StepActions } from "@/components/wizard/fields";
import { FormatStep } from "@/components/wizard/format-step";
import { TeamsStep } from "@/components/wizard/teams-step";
import type { LeagueRow, TeamRow } from "@/lib/leagues";

const STEPS = ["basics", "teams", "format", "review"] as const;
export type WizardStep = (typeof STEPS)[number];
const STEP_TITLES: Record<WizardStep, string> = {
  basics: "League details",
  teams: "Teams",
  format: "Format",
  review: "Review",
};

export function LeagueWizard({
  initialLeague,
  initialTeams,
  isAdmin,
  initialStep,
}: {
  initialLeague: LeagueRow | null;
  initialTeams: TeamRow[];
  isAdmin: boolean;
  initialStep: WizardStep;
}) {
  const router = useRouter();
  const [league, setLeague] = useState(initialLeague);
  const [teams, setTeams] = useState(initialTeams);
  const [step, setStep] = useState<WizardStep>(initialLeague ? initialStep : "basics");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const stepIndex = STEPS.indexOf(step);
  const isDraft = !league || league.status === "draft";

  const go = (next: WizardStep) => {
    setError(null);
    setStep(next);
    window.scrollTo(0, 0);
  };

  const publish = () => {
    if (!league) return;
    setError(null);
    startTransition(async () => {
      const result = await publishLeague(league.id);
      if (result.ok) router.push(`/leagues/${result.slug}`);
      else setError(result.error);
    });
  };

  const remove = () => {
    if (!league || !window.confirm(`Delete ${league.name}? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLeague(league.id);
      if (result.ok) router.push("/");
      else setError(result.error);
    });
  };

  return (
    <div>
      <p className="text-sm font-semibold text-muted">
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <h1 className="mb-1 font-display text-3xl font-bold">{STEP_TITLES[step]}</h1>
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {STEPS.map((name, index) => (
          <div
            key={name}
            className={`h-1 flex-1 rounded-full ${index <= stepIndex ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>

      {step === "basics" && (
        <BasicsStep
          league={league}
          isAdmin={isAdmin}
          onCreated={(id) => router.replace(`/leagues/${id}/setup?step=teams`)}
          onSaved={(saved) => {
            setLeague(saved);
            go("teams");
          }}
        />
      )}

      {step === "teams" && league && (
        <TeamsStep
          league={league}
          teams={teams}
          onBack={() => go("basics")}
          onSaved={(savedLeague, savedTeams, advance) => {
            setLeague(savedLeague);
            setTeams(savedTeams);
            if (advance) go("format");
          }}
        />
      )}

      {step === "format" && league && (
        <FormatStep
          league={league}
          teams={teams}
          onBack={() => go("teams")}
          onSaved={(saved) => {
            setLeague(saved);
            go("review");
          }}
        />
      )}

      {step === "review" && league && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-4">
            <dt className="text-muted">Name</dt>
            <dd className="min-w-0 truncate font-semibold">{league.name}</dd>
            <dt className="text-muted">Type</dt>
            <dd className="font-semibold capitalize">{league.type}</dd>
            {league.sport && (
              <>
                <dt className="text-muted">Sport</dt>
                <dd className="font-semibold">{league.sport}</dd>
              </>
            )}
            <dt className="text-muted">Teams</dt>
            <dd className="font-semibold">{teams.length}</dd>
            <dt className="text-muted">Starts</dt>
            <dd className="font-semibold">
              <LocalTime iso={league.deadline} />
            </dd>
          </dl>

          <FormError message={error} />
          {isDraft ? (
            <StepActions
              onBack={() => go("format")}
              primaryLabel={isPending ? "Publishing…" : "Publish league"}
              primaryDisabled={isPending}
              onPrimary={publish}
            />
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => go("format")}
                className="h-13 rounded-lg border border-line px-5 font-semibold"
              >
                Back
              </button>
              <Link
                href={`/leagues/${league.slug}`}
                className="flex h-13 flex-1 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
              >
                Done
              </Link>
            </div>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="h-11 text-sm font-semibold text-relegation underline"
          >
            Delete this league
          </button>
        </div>
      )}
    </div>
  );
}
