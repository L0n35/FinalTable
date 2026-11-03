import type { ReactNode } from "react";

export const inputClass =
  "h-12 w-full rounded-lg border border-line bg-surface px-3 text-foreground placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-accent";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-relegation">
      {message}
    </p>
  );
}

export function StepActions({
  onBack,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondary,
}: {
  onBack?: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondary?: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-13 rounded-lg border border-line px-5 font-semibold"
          >
            Back
          </button>
        )}
        <button
          type={onPrimary ? "button" : "submit"}
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="h-13 flex-1 rounded-lg bg-accent font-display text-xl font-bold text-accent-ink disabled:opacity-60"
        >
          {primaryLabel}
        </button>
      </div>
      {secondary}
    </div>
  );
}

export function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="h-11 w-11 rounded-lg border border-line text-xl font-semibold disabled:opacity-40"
      >
        −
      </button>
      <output id={id} className="w-10 text-center font-display text-2xl font-bold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="h-11 w-11 rounded-lg border border-line text-xl font-semibold disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
