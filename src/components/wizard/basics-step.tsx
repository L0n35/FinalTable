"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createCustomLeague, updateBasics } from "@/app/leagues/actions";
import { Field, FormError, inputClass, Stepper, StepActions } from "@/components/wizard/fields";
import { MAX_TEAMS, MIN_TEAMS, isPresetLeague, type LeagueRow, type LeagueType } from "@/lib/leagues";

// datetime-local works in the viewer's own time zone, without an offset.
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PrivacyChoice({
  value,
  onChange,
}: {
  value: LeagueType;
  onChange: (type: LeagueType) => void;
}) {
  const options: { value: LeagueType; label: string; description: string }[] = [
    { value: "private", label: "Private", description: "Only people with the link or code can join." },
    { value: "public", label: "Public", description: "Anyone can find and join it on Explore." },
  ];
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">Who can join?</legend>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              value === option.value ? "border-accent bg-surface-raised" : "border-line bg-surface"
            }`}
          >
            <input
              type="radio"
              name="league-type"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-semibold">{option.label}</span>
              <span className="block text-sm text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DeadlineField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Field
      label="Predictions lock"
      htmlFor="league-deadline"
      hint={`Usually the first game. Your time zone: ${timeZone}.`}
    >
      <input
        id="league-deadline"
        type="datetime-local"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} date-input`}
      />
    </Field>
  );
}

// Returns an ISO date, or an error message people can act on.
export function readDeadline(value: string): { iso: string } | { error: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: "Please choose when predictions lock." };
  if (date.getTime() <= Date.now()) return { error: "The lock time needs to be in the future." };
  return { iso: date.toISOString() };
}

export function BasicsStep({
  league,
  onBack,
  onCreated,
  onSaved,
}: {
  league: LeagueRow | null;
  onBack?: () => void;
  onCreated: (id: string) => void;
  onSaved: (league: LeagueRow) => void;
}) {
  const [name, setName] = useState(league?.name ?? "");
  const [type, setType] = useState<LeagueType>(league?.type ?? "private");
  const [sport, setSport] = useState(league?.sport ?? "");
  const [teamCount, setTeamCount] = useState(league?.team_count ?? 20);
  const [deadline, setDeadline] = useState(league ? toLocalInput(league.deadline) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A preset's teams, sport and deadline come from its official season.
  const isPreset = league !== null && isPresetLeague(league);
  const isOfficial = league?.type === "official";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    let iso = league?.deadline ?? "";
    if (!isPreset) {
      const parsed = readDeadline(deadline);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      iso = parsed.iso;
    }
    setError(null);
    const input = { name, type, sport, deadline: iso };
    startTransition(async () => {
      if (league) {
        const result = await updateBasics(league.id, input);
        if (result.ok) onSaved(result.league);
        else setError(result.error);
      } else {
        const result = await createCustomLeague({ ...input, teamCount });
        if (result.ok) onCreated(result.id);
        else setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label={isOfficial ? "League name" : "Group name"} htmlFor="league-name">
        <input
          id="league-name"
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Sunday League 2027"
          className={inputClass}
        />
      </Field>

      {!isOfficial && <PrivacyChoice value={type} onChange={setType} />}

      {!isPreset && !isOfficial && (
        <Field label="Sport (optional)" htmlFor="league-sport">
          <input
            id="league-sport"
            maxLength={40}
            value={sport}
            onChange={(event) => setSport(event.target.value)}
            placeholder="Football"
            className={inputClass}
          />
        </Field>
      )}

      {!league && (
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

      {!isPreset && <DeadlineField value={deadline} onChange={setDeadline} />}

      <FormError message={error} />
      <StepActions
        onBack={onBack}
        primaryLabel={isPending ? "Saving…" : isPreset ? "Save" : "Next: teams"}
        primaryDisabled={isPending}
      />
    </form>
  );
}
