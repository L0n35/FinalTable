"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteLeague, publishSeason } from "@/app/leagues/actions";
import { LocalTime } from "@/components/local-time";
import { BasicsStep } from "@/components/wizard/basics-step";
import { FormError, StepActions } from "@/components/wizard/fields";
import { FormatStep } from "@/components/wizard/format-step";
import { OfficialStep, type ExistingSeason } from "@/components/wizard/official-step";
import { PresetPicker, type Preset } from "@/components/wizard/preset-picker";
import { TeamsStep } from "@/components/wizard/teams-step";
import { isPresetLeague, leagueNoun, seasonTitle, type LeagueRow, type StartKind, type TeamRow } from "@/lib/leagues";

const STEPS = ["basics", "teams", "format", "review"] as const;
export type WizardStep = (typeof STEPS)[number];
const STEP_TITLES: Record<WizardStep, string> = {
  basics: "Details",
  teams: "Teams",
  format: "Format",
  review: "Review",
};

function StartChoice({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 text-left"
    >
      <span>
        <span className="block font-display text-2xl font-bold">{title}</span>
        <span className="block text-muted">{description}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-muted">
        ›
      </span>
    </button>
  );
}

export function LeagueWizard({
  initialLeague,
  initialTeams,
  isAdmin,
  initialStep,
  presets = [],
  comingSoon = [],
  officialSeasons = [],
  initialKind = null,
}: {
  initialLeague: LeagueRow | null;
  initialTeams: TeamRow[];
  isAdmin: boolean;
  initialStep: WizardStep;
  presets?: Preset[];
  comingSoon?: string[];
  officialSeasons?: ExistingSeason[];
  initialKind?: StartKind | null;
}) {
  const router = useRouter();
  const [league, setLeague] = useState(initialLeague);
  const [teams, setTeams] = useState(initialTeams);
  const [step, setStep] = useState<WizardStep>(initialLeague ? initialStep : "basics");
  const [kind, setKind] = useState<StartKind | null>(initialKind);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const stepIndex = STEPS.indexOf(step);
  const isDraft = !league || league.status === "draft";
  const noun = league ? leagueNoun(league) : "league";

  const go = (next: WizardStep) => {
    setError(null);
    setStep(next);
    window.scrollTo(0, 0);
  };

  const openCreated = (id: string) => router.replace(`/leagues/${id}/setup?step=teams`);

  const publish = () => {
    if (!league) return;
    setError(null);
    startTransition(async () => {
      const result = await publishSeason(league);
      if (result.ok) router.push(`/leagues/${league.slug}`);
      else setError(result.error);
    });
  };

  const remove = () => {
    if (!league || !window.confirm(`Delete ${league.name}? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLeague(league.id);
      if (result.ok) router.push(league.type === "official" ? "/admin" : "/");
      else setError(result.error);
    });
  };

  // Starting a new league: choose how, before any steps apply.
  if (!league && kind === null) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="mb-1 font-display text-3xl font-bold">Start a league or group</h1>
        <StartChoice
          title="Run your own league"
          description="Your teams, your format, your deadline. You keep the table, and the scores follow."
          onClick={() => setKind("custom")}
        />
        <StartChoice
          title="Play a real league with friends"
          description="Make a group on a real league. Teams and standings update automatically."
          onClick={() => setKind("preset")}
        />
        {isAdmin && (
          <StartChoice
            title="Official league"
            description="Admins only. Add a competition season for everyone to play."
            onClick={() => setKind("official")}
          />
        )}
      </div>
    );
  }

  if (!league && kind === "preset") {
    return (
      <div>
        <h1 className="mb-4 font-display text-3xl font-bold">Choose a league</h1>
        <PresetPicker presets={presets} comingSoon={comingSoon} onBack={() => setKind(null)} />
      </div>
    );
  }

  if (!league && kind === "official") {
    return (
      <div>
        <h1 className="mb-4 font-display text-3xl font-bold">New official league</h1>
        <OfficialStep
          seasons={officialSeasons}
          onBack={() => setKind(null)}
          onCreated={openCreated}
        />
      </div>
    );
  }

  // A group on a real league has nothing to set up beyond its name and privacy.
  if (league && isPresetLeague(league)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-bold">Group settings</h1>
        <p className="text-muted">
          This group plays {seasonTitle(league)}, so its teams, deadline and standings come from
          the global league.
        </p>
        <BasicsStep
          league={league}
          onCreated={openCreated}
          onSaved={(saved) => router.push(`/leagues/${saved.slug}`)}
        />
        <FormError message={error} />
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="h-11 text-sm font-semibold text-relegation underline"
        >
          Delete this group
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold text-muted">
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <h1 className="mb-1 font-display text-3xl font-bold">
        {step === "basics" ? `${noun === "group" ? "Group" : "League"} details` : STEP_TITLES[step]}
      </h1>
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
          onBack={league ? undefined : () => setKind(null)}
          onCreated={openCreated}
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
            <dt className="text-muted">Locks</dt>
            <dd className="font-semibold">
              <LocalTime iso={league.deadline} />
            </dd>
          </dl>

          <FormError message={error} />
          {isDraft ? (
            <StepActions
              onBack={() => go("format")}
              primaryLabel={isPending ? "Publishing…" : `Publish ${noun}`}
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
            Delete this {noun}
          </button>
        </div>
      )}
    </div>
  );
}
