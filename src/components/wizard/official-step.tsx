"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createOfficialSeason } from "@/app/leagues/actions";
import { DeadlineField, readDeadline } from "@/components/wizard/basics-step";
import { Field, FormError, inputClass, Stepper, StepActions } from "@/components/wizard/fields";
import { MAX_TEAMS, MIN_TEAMS, type LeagueRow } from "@/lib/leagues";

export type ExistingSeason = Pick<
  LeagueRow,
  "season_id" | "sport" | "competition_name" | "season_label" | "deadline"
>;

const same = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export function OfficialStep({
  seasons,
  onBack,
  onCreated,
}: {
  seasons: ExistingSeason[];
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const [sport, setSport] = useState("");
  const [competition, setCompetition] = useState("");
  const [label, setLabel] = useState("");
  const [teamCount, setTeamCount] = useState(20);
  const [deadline, setDeadline] = useState("");
  const [copy, setCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sports = [...new Set(seasons.map((season) => season.sport ?? ""))].filter(Boolean).sort();
  const competitions = [
    ...new Set(
      seasons
        .filter((season) => same(season.sport, sport))
        .map((season) => season.competition_name ?? ""),
    ),
  ].sort();
  const latest = seasons
    .filter((season) => same(season.sport, sport) && same(season.competition_name, competition))
    .sort((a, b) => b.deadline.localeCompare(a.deadline))[0];
  const copying = latest !== undefined && copy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = readDeadline(deadline);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createOfficialSeason({
        sport,
        competition,
        label,
        teamCount,
        deadline: parsed.iso,
        copyFrom: copying ? latest.season_id : null,
      });
      if (result.ok) onCreated(result.id);
      else setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-muted">
        Official leagues belong to the site. Any admin can manage them, players see them on Explore
        as global leagues, and people can play them in their own groups.
      </p>

      <Field label="Sport" htmlFor="official-sport">
        <input
          id="official-sport"
          required
          maxLength={40}
          list="official-sports"
          value={sport}
          onChange={(event) => setSport(event.target.value)}
          placeholder="Football"
          className={inputClass}
        />
        <datalist id="official-sports">
          {sports.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </Field>

      <Field label="Competition" htmlFor="official-competition">
        <input
          id="official-competition"
          required
          maxLength={60}
          list="official-competitions"
          value={competition}
          onChange={(event) => setCompetition(event.target.value)}
          placeholder="Premier League"
          className={inputClass}
        />
        <datalist id="official-competitions">
          {competitions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </Field>

      <Field label="Season" htmlFor="official-season">
        <input
          id="official-season"
          required
          maxLength={20}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="2026-27"
          className={inputClass}
        />
      </Field>

      {latest && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3">
          <input
            type="checkbox"
            checked={copy}
            onChange={(event) => setCopy(event.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-semibold">Copy from {latest.season_label}</span>
            <span className="block text-sm text-muted">
              Starts with last season&apos;s teams, logos and zones, ready for you to swap promoted
              and relegated teams.
            </span>
          </span>
        </label>
      )}

      {!copying && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Number of teams</span>
          <Stepper
            id="team-count"
            label="number of teams"
            value={teamCount}
            min={MIN_TEAMS}
            max={MAX_TEAMS}
            onChange={setTeamCount}
          />
        </div>
      )}

      <DeadlineField value={deadline} onChange={setDeadline} />

      <FormError message={error} />
      <StepActions
        onBack={onBack}
        primaryLabel={isPending ? "Saving…" : "Next: teams"}
        primaryDisabled={isPending}
      />
    </form>
  );
}
