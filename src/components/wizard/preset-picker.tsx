"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPresetLeague } from "@/app/leagues/actions";
import { LocalTime } from "@/components/local-time";
import { PrivacyChoice } from "@/components/wizard/basics-step";
import { Field, FormError, inputClass, StepActions } from "@/components/wizard/fields";
import { seasonTitle, type LeagueRow, type LeagueType } from "@/lib/leagues";

export type Preset = Pick<
  LeagueRow,
  "season_id" | "sport" | "competition_name" | "competition_id" | "season_label" | "deadline" | "team_count"
>;

function ChoiceList({
  label,
  items,
}: {
  label: string;
  items: { key: string; title: string; detail?: React.ReactNode; onClick: () => void }[];
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={item.onClick}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{item.title}</span>
              {item.detail && <span className="block text-sm text-muted">{item.detail}</span>}
            </span>
            <span aria-hidden="true" className="text-xl text-muted">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PresetPicker({ presets, onBack }: { presets: Preset[]; onBack: () => void }) {
  const router = useRouter();
  const [sport, setSport] = useState<string | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<LeagueType>("private");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sports = [...new Set(presets.map((item) => item.sport ?? "Other"))].sort();
  const inSport = presets.filter((item) => (item.sport ?? "Other") === sport);
  const competitions = [...new Map(inSport.map((item) => [item.competition_id, item])).values()].sort(
    (a, b) => (a.competition_name ?? "").localeCompare(b.competition_name ?? ""),
  );
  const seasons = inSport.filter((item) => item.competition_id === competitionId);

  const pick = (chosen: Preset) => {
    setPreset(chosen);
    setName(seasonTitle(chosen) ?? "");
  };

  const pickCompetition = (id: string | null) => {
    const options = inSport.filter((item) => item.competition_id === id);
    setCompetitionId(id);
    // Usually only the upcoming season is open, so there's nothing to choose.
    if (options.length === 1) pick(options[0]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!preset) return;
    setError(null);
    startTransition(async () => {
      const result = await createPresetLeague(preset.season_id, name, type);
      if (result.ok) router.push(`/leagues/${result.slug}`);
      else setError(result.error);
    });
  };

  const back = () => {
    setError(null);
    if (preset) {
      setPreset(null);
      if (seasons.length === 1) setCompetitionId(null);
    } else if (competitionId) {
      setCompetitionId(null);
    } else if (sport) {
      setSport(null);
    } else {
      onBack();
    }
  };

  const backButton = (
    <button type="button" onClick={back} className="h-12 self-start rounded-lg border border-line px-5 font-semibold">
      Back
    </button>
  );

  if (presets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted">No real leagues are open right now. You can make your own instead.</p>
        {backButton}
      </div>
    );
  }

  if (preset) {
    return (
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="font-semibold">{seasonTitle(preset)}</p>
          <p className="text-sm text-muted">
            {preset.team_count} teams · Locks <LocalTime iso={preset.deadline} />
          </p>
          <p className="mt-1 text-sm text-muted">
            Teams, deadline and standings come from the global league and update automatically.
          </p>
        </div>
        <Field label="Group name" htmlFor="league-name">
          <input
            id="league-name"
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </Field>
        <PrivacyChoice value={type} onChange={setType} />
        <FormError message={error} />
        <StepActions
          onBack={back}
          primaryLabel={isPending ? "Creating…" : "Create group"}
          primaryDisabled={isPending}
        />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!sport && (
        <ChoiceList
          label="Sports"
          items={sports.map((item) => ({ key: item, title: item, onClick: () => setSport(item) }))}
        />
      )}
      {sport && !competitionId && (
        <ChoiceList
          label="Competitions"
          items={competitions.map((item) => ({
            key: item.competition_id ?? "",
            title: item.competition_name ?? "",
            onClick: () => pickCompetition(item.competition_id),
          }))}
        />
      )}
      {sport && competitionId && (
        <ChoiceList
          label="Seasons"
          items={seasons.map((item) => ({
            key: item.season_id,
            title: item.season_label ?? "",
            detail: (
              <>
                Locks <LocalTime iso={item.deadline} />
              </>
            ),
            onClick: () => pick(item),
          }))}
        />
      )}
      {backButton}
    </div>
  );
}
