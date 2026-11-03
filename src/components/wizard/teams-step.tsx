"use client";

import { useState, useTransition } from "react";
import { saveTeams } from "@/app/leagues/actions";
import { TeamBadge } from "@/components/team-badge";
import { FormError, inputClass, StepActions } from "@/components/wizard/fields";
import { newId } from "@/lib/browser-utils";
import {
  BADGE_COLOURS,
  initialsFor,
  logoUrl,
  MAX_TEAMS,
  MIN_TEAMS,
  type LeagueRow,
  type TeamRow,
} from "@/lib/leagues";
import { MAX_LOGO_BYTES, resizeLogo } from "@/lib/resize-logo";
import { createClient } from "@/lib/supabase/client";

type Row = {
  key: string;
  id?: string;
  name: string;
  logoPath: string | null;
  primary: string;
  secondary: string;
};

function blankRow(index: number): Row {
  const [primary, secondary] = BADGE_COLOURS[index % BADGE_COLOURS.length];
  return { key: newId(), name: "", logoPath: null, primary, secondary };
}

function initialRows(teams: TeamRow[], count: number): Row[] {
  const rows: Row[] = teams.map((team) => ({
    key: team.id,
    id: team.id,
    name: team.name,
    logoPath: team.logo_path,
    primary: team.colour_primary,
    secondary: team.colour_secondary,
  }));
  while (rows.length < count) rows.push(blankRow(rows.length));
  return rows;
}

export function TeamsStep({
  league,
  teams,
  onBack,
  onSaved,
}: {
  league: LeagueRow;
  teams: TeamRow[];
  onBack: () => void;
  onSaved: (league: LeagueRow, teams: TeamRow[], advance: boolean) => void;
}) {
  const [rows, setRows] = useState(() => initialRows(teams, league.team_count));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDraft = league.status === "draft";
  const filled = rows.filter((row) => row.name.trim());

  const update = (key: string, change: Partial<Row>) => {
    setSavedDraft(false);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  const addRow = () =>
    setRows((current) => [...current, blankRow(current.length)]);

  const removeRow = (key: string) =>
    setRows((current) => current.filter((row) => row.key !== key));

  const applyPaste = () => {
    const names = [
      ...new Set(
        pasted
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
    if (names.length === 0) return;
    setRows((current) => {
      const next = [...current];
      for (const name of names) {
        if (next.some((row) => row.name.trim().toLowerCase() === name.toLowerCase())) continue;
        const blank = next.find((row) => !row.name.trim());
        if (blank) blank.name = name;
        else if (next.length < MAX_TEAMS) next.push({ ...blankRow(next.length), name });
      }
      return next.map((row) => ({ ...row }));
    });
    setPasted("");
  };

  const uploadLogo = async (row: Row, file: File) => {
    setError(null);
    setUploadingKey(row.key);
    try {
      const blob = await resizeLogo(file);
      if (!blob) {
        setError("That file couldn't be read as an image. Please try a PNG or JPEG.");
        return;
      }
      if (blob.size > MAX_LOGO_BYTES) {
        setError("That logo is too detailed to store. Please try a simpler image.");
        return;
      }
      const extension = blob.type === "image/webp" ? "webp" : "png";
      const path = `${league.id}/${newId()}.${extension}`;
      const { error: uploadError } = await createClient()
        .storage.from("team-logos")
        .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (uploadError) {
        setError("The logo didn't upload. Please try again.");
        return;
      }
      update(row.key, { logoPath: path });
    } finally {
      setUploadingKey(null);
    }
  };

  const save = (advance: boolean) => {
    setSavedDraft(false);
    const names = filled.map((row) => row.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      setError("Each team needs a different name.");
      return;
    }
    if ((advance || !isDraft) && filled.length !== rows.length) {
      setError(`Please name all ${rows.length} teams, or remove the empty rows.`);
      return;
    }
    setError(null);
    const payload = filled.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      logo_path: row.logoPath,
      colour_primary: row.primary,
      colour_secondary: row.secondary,
    }));
    startTransition(async () => {
      const result = await saveTeams(league.id, rows.length, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Adopt the ids of newly created teams, so saving twice doesn't recreate them.
      setRows(initialRows(result.teams, rows.length));
      setSavedDraft(!advance);
      onSaved(result.league, result.teams, advance);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {!isDraft && (
        <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
          Renaming teams is safe. Adding or removing a team asks everyone who has predicted to
          review their table.
        </p>
      )}

      <details className="rounded-lg border border-line bg-surface p-3">
        <summary className="cursor-pointer font-semibold">Paste a list of teams</summary>
        <label htmlFor="team-paste" className="mt-2 block text-sm text-muted">
          One team per line
        </label>
        <textarea
          id="team-paste"
          rows={5}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          className={`${inputClass} mt-1 h-auto py-2`}
        />
        <button
          type="button"
          onClick={applyPaste}
          className="mt-2 h-11 w-full rounded-lg border border-line font-semibold"
        >
          Add these teams
        </button>
      </details>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const preview = {
            id: row.key,
            name: row.name,
            initials: initialsFor(row.name),
            primary: row.primary,
            secondary: row.secondary,
            logoUrl: row.logoPath ? logoUrl(row.logoPath) : null,
          };
          const isOpen = openKey === row.key;
          return (
            <li key={row.key} className="rounded-lg border border-line bg-surface">
              <div className="flex items-center gap-2 pr-1 pl-2">
                <button
                  type="button"
                  aria-label={`Edit badge for team ${index + 1}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey(isOpen ? null : row.key)}
                  className="flex h-12 w-11 shrink-0 items-center justify-center rounded-lg"
                >
                  <TeamBadge team={preview} />
                </button>
                <input
                  aria-label={`Team ${index + 1} name`}
                  value={row.name}
                  maxLength={60}
                  enterKeyHint="next"
                  placeholder={`Team ${index + 1}`}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  className="h-12 min-w-0 flex-1 bg-transparent placeholder:text-muted/70 focus-visible:outline-none"
                />
                <button
                  type="button"
                  aria-label={`Remove team ${index + 1}`}
                  disabled={rows.length <= MIN_TEAMS}
                  onClick={() => removeRow(row.key)}
                  className="h-11 w-11 shrink-0 text-xl text-muted disabled:opacity-30"
                >
                  ×
                </button>
              </div>
              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-line p-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="color"
                        aria-label={`Badge colour for team ${index + 1}`}
                        value={row.primary}
                        onChange={(event) => update(row.key, { primary: event.target.value })}
                        className="h-10 w-10 rounded border border-line bg-transparent"
                      />
                      Badge
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="color"
                        aria-label={`Letter colour for team ${index + 1}`}
                        value={row.secondary}
                        onChange={(event) => update(row.key, { secondary: event.target.value })}
                        className="h-10 w-10 rounded border border-line bg-transparent"
                      />
                      Letters
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-line font-semibold">
                      {uploadingKey === row.key
                        ? "Uploading…"
                        : row.logoPath
                          ? "Replace logo"
                          : "Upload logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label={`Logo for team ${index + 1}`}
                        className="sr-only"
                        disabled={uploadingKey !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadLogo(row, file);
                        }}
                      />
                    </label>
                    {row.logoPath && (
                      <button
                        type="button"
                        onClick={() => update(row.key, { logoPath: null })}
                        className="h-11 rounded-lg border border-line px-3 font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted">
                    Only upload images you have permission to use.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_TEAMS}
        className="h-12 rounded-lg border border-dashed border-muted font-semibold disabled:opacity-40"
      >
        Add a team
      </button>

      <FormError message={error} />
      <StepActions
        onBack={onBack}
        primaryLabel={isPending ? "Saving…" : "Next: format"}
        primaryDisabled={isPending || uploadingKey !== null}
        onPrimary={() => save(true)}
        secondary={
          isDraft && (
            <button
              type="button"
              disabled={isPending || uploadingKey !== null}
              onClick={() => save(false)}
              className="h-11 text-sm font-semibold text-muted underline"
            >
              {savedDraft ? "Draft saved" : "Save and finish later"}
            </button>
          )
        }
      />
    </div>
  );
}
