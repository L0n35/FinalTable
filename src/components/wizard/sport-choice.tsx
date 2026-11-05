"use client";

import { useState } from "react";
import { inputClass } from "@/components/wizard/fields";
import { listedSport, SPORT_OPTIONS, surfaceFor } from "@/lib/leagues";

function SportTile({
  label,
  sport,
  checked,
  onChoose,
}: {
  label: string;
  sport: string;
  checked: boolean;
  onChoose: () => void;
}) {
  return (
    <label
      data-surface={surfaceFor(sport)}
      className={`league-tile flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? "border-accent ring-1 ring-accent" : "border-chalk"
      }`}
    >
      <input type="radio" name="league-sport" checked={checked} onChange={onChoose} className="sr-only" />
      <span className="font-display text-xl leading-tight font-bold">{label}</span>
      {checked && (
        <span aria-hidden="true" className="font-bold text-accent-on-turf">
          ✓
        </span>
      )}
    </label>
  );
}

// Each listed sport shows the ground it gets. Anything else can be typed in, and plays on a plain one.
export function SportChoice({ value, onChange }: { value: string; onChange: (sport: string) => void }) {
  const listed = listedSport(value);
  const [isOther, setIsOther] = useState(value.trim() !== "" && listed === null);

  return (
    <fieldset>
      <legend className="font-semibold">Sport (optional)</legend>
      <p className="mb-2 text-sm text-muted">This sets the look of your league&apos;s ground.</p>
      <div className="grid grid-cols-2 gap-2">
        {SPORT_OPTIONS.map((sport) => (
          <SportTile
            key={sport}
            label={sport}
            sport={sport}
            checked={!isOther && listed === sport}
            onChoose={() => {
              setIsOther(false);
              onChange(sport);
            }}
          />
        ))}
        <SportTile
          label="Something else"
          sport=""
          checked={isOther}
          onChoose={() => {
            setIsOther(true);
            onChange("");
          }}
        />
      </div>
      {isOther && (
        <input
          aria-label="Which sport?"
          maxLength={40}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Which sport? Darts, netball, anything"
          className={`${inputClass} mt-2`}
        />
      )}
    </fieldset>
  );
}
