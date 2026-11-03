"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitReport } from "@/app/leagues/actions";
import { Sheet } from "@/components/sheet";
import { Field, inputClass } from "@/components/wizard/fields";

export function ReportButton({
  leagueId,
  noun,
  logoTeams,
}: {
  leagueId: string;
  noun: "league" | "group";
  // Teams with an uploaded logo, which can be reported on their own.
  logoTeams: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setError(null);
    setSent(false);
    setReason("");
    setTeamId("");
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitReport(leagueId, teamId || null, reason).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server. Please try again.",
      }));
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 w-full text-sm font-semibold text-muted underline"
      >
        Report a problem with this {noun}
      </button>
      <Sheet open={open} label="Report a problem" onClose={close}>
        {sent ? (
          <>
            <h2 className="font-display text-2xl font-bold">Thanks for telling us</h2>
            <p className="mt-1 text-muted">An admin will take a look.</p>
            <button
              type="button"
              onClick={close}
              className="mt-4 h-12 w-full rounded-lg bg-accent font-semibold text-accent-ink"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold">Report a problem</h2>
            {logoTeams.length > 0 && (
              <Field label="What's the problem with?" htmlFor="report-about">
                <select
                  id="report-about"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">The {noun}</option>
                  {logoTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      Logo: {team.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="What's wrong?" htmlFor="report-reason">
              <textarea
                id="report-reason"
                required
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={`${inputClass} h-auto py-2`}
              />
            </Field>
            {error && (
              <p role="alert" className="text-relegation">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={close} className="h-12 rounded-lg border border-line font-semibold">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || reason.trim() === ""}
                className="h-12 rounded-lg bg-accent font-semibold text-accent-ink disabled:opacity-60"
              >
                {isPending ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
