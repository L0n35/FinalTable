"use client";

import { useState, useTransition } from "react";
import { saveFormat } from "@/app/leagues/actions";
import { LeagueTable } from "@/components/league-table";
import { ZoneLegend } from "@/components/zone-legend";
import { FormError, Stepper, StepActions } from "@/components/wizard/fields";
import { toTeam, zoneProblem, zonesOf, type LeagueRow, type TeamRow, type Zones } from "@/lib/leagues";

function ZoneToggle({
  id,
  label,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <label htmlFor={id} className="flex h-8 cursor-pointer items-center justify-between gap-3 font-semibold">
        {label}
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>
      {checked && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

export function FormatStep({
  league,
  teams,
  onBack,
  onSaved,
}: {
  league: LeagueRow;
  teams: TeamRow[];
  onBack: () => void;
  onSaved: (league: LeagueRow) => void;
}) {
  const [zones, setZones] = useState<Zones>(() => zonesOf(league));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = teams.length;
  const problem = zoneProblem(zones, total);
  const change = (next: Partial<Zones>) => {
    setError(null);
    setZones((current) => ({ ...current, ...next }));
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveFormat(league, zones);
      if (result.ok) onSaved(result.league);
      else setError(result.error);
    });
  };

  const row = (label: string, stepper: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      {stepper}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">Zones are optional. Correct picks in a zone earn bonus points.</p>

      <ZoneToggle
        id="zone-promotion"
        label="Promotion"
        checked={zones.promotion > 0}
        onChange={(on) => change({ promotion: on ? 1 : 0 })}
      >
        {row(
          "Teams going up",
          <Stepper
            id="promotion-count"
            label="teams promoted"
            value={zones.promotion}
            min={1}
            max={total - 1}
            onChange={(promotion) => change({ promotion })}
          />,
        )}
      </ZoneToggle>

      <ZoneToggle
        id="zone-playoff"
        label="Playoffs"
        checked={zones.playoffFrom !== null}
        onChange={(on) =>
          change(
            on
              ? { playoffFrom: zones.promotion + 1, playoffTo: zones.promotion + 1 }
              : { playoffFrom: null, playoffTo: null },
          )
        }
      >
        {zones.playoffFrom !== null && zones.playoffTo !== null && (
          <>
            {row(
              "From position",
              <Stepper
                id="playoff-from"
                label="first playoff position"
                value={zones.playoffFrom}
                min={1}
                max={total}
                onChange={(playoffFrom) => change({ playoffFrom })}
              />,
            )}
            {row(
              "To position",
              <Stepper
                id="playoff-to"
                label="last playoff position"
                value={zones.playoffTo}
                min={1}
                max={total}
                onChange={(playoffTo) => change({ playoffTo })}
              />,
            )}
          </>
        )}
      </ZoneToggle>

      <ZoneToggle
        id="zone-relegation"
        label="Relegation"
        checked={zones.relegation > 0}
        onChange={(on) => change({ relegation: on ? 1 : 0 })}
      >
        {row(
          "Teams going down",
          <Stepper
            id="relegation-count"
            label="teams relegated"
            value={zones.relegation}
            min={1}
            max={total - 1}
            onChange={(relegation) => change({ relegation })}
          />,
        )}
      </ZoneToggle>

      <FormError message={problem ?? error} />
      <StepActions
        onBack={onBack}
        primaryLabel={isPending ? "Saving…" : "Next: review"}
        primaryDisabled={isPending || problem !== null}
        onPrimary={save}
      />

      <section aria-label="Table preview">
        <h2 className="mt-2 mb-2 font-display text-xl font-bold">Preview</h2>
        <ZoneLegend zones={zones} total={total} />
        <LeagueTable teams={teams.map(toTeam)} zones={zones} />
      </section>
    </div>
  );
}
