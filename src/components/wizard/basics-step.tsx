"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createLeague, updateBasics } from "@/app/leagues/actions";
import { Field, FormError, inputClass, Stepper, StepActions } from "@/components/wizard/fields";
import { MAX_TEAMS, MIN_TEAMS, type LeagueRow, type LeagueType } from "@/lib/leagues";

// datetime-local works in the viewer's own time zone, without an offset.
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const TYPE_OPTIONS: { value: LeagueType; label: string; description: string; adminOnly?: boolean }[] = [
  { value: "private", label: "Private", description: "Only people with the link or code can join." },
  { value: "public", label: "Public", description: "Anyone can find and join it." },
  { value: "host", label: "Host", description: "An official league, featured for everyone.", adminOnly: true },
];

export function BasicsStep({
  league,
  isAdmin,
  onCreated,
  onSaved,
}: {
  league: LeagueRow | null;
  isAdmin: boolean;
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

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) {
      setError("Please choose a start date and time.");
      return;
    }
    if (date.getTime() <= Date.now()) {
      setError("The start date needs to be in the future.");
      return;
    }
    setError(null);
    const input = { name, type, sport, teamCount, deadline: date.toISOString() };
    startTransition(async () => {
      if (league) {
        const result = await updateBasics(league.id, input);
        if (result.ok) onSaved(result.league);
        else setError(result.error);
      } else {
        const result = await createLeague(input);
        if (result.ok) onCreated(result.id);
        else setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="League name" htmlFor="league-name">
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

      <fieldset>
        <legend className="mb-1 font-semibold">Who can join?</legend>
        <div className="flex flex-col gap-2">
          {TYPE_OPTIONS.filter((option) => !option.adminOnly || isAdmin).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                type === option.value ? "border-accent bg-surface-raised" : "border-line bg-surface"
              }`}
            >
              <input
                type="radio"
                name="league-type"
                value={option.value}
                checked={type === option.value}
                onChange={() => setType(option.value)}
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

      <Field
        label="League start"
        htmlFor="league-deadline"
        hint={`Predictions lock at this time. Your time zone: ${timeZone}.`}
      >
        <input
          id="league-deadline"
          type="datetime-local"
          required
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className={inputClass}
        />
      </Field>

      <FormError message={error} />
      <StepActions primaryLabel={isPending ? "Saving…" : "Next: teams"} primaryDisabled={isPending} />
    </form>
  );
}
