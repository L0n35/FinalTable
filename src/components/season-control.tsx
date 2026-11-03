"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishSeason, reopenSeason } from "@/app/leagues/actions";
import { Sheet } from "@/components/sheet";

const ACTIONS = {
  finish: {
    run: finishSeason,
    button: "Finish season",
    title: "Finish this season?",
    detail: "The table and scores become final, and the winner is announced.",
    confirm: "Finish season",
  },
  reopen: {
    run: reopenSeason,
    button: "Reopen season",
    title: "Reopen this season?",
    detail: "Scores go back to provisional, and the standings can be updated again.",
    confirm: "Reopen season",
  },
};

export function SeasonControl({
  seasonId,
  action,
  sharedNote,
}: {
  seasonId: string;
  action: keyof typeof ACTIONS;
  sharedNote?: string;
}) {
  const { run, button, title, detail, confirm } = ACTIONS[action];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    setError(null);
    startTransition(async () => {
      const result = await run(seasonId).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server. Please try again.",
      }));
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-lg border border-line font-semibold"
      >
        {button}
      </button>
      <Sheet open={open} label={title} onClose={() => setOpen(false)}>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-muted">
          {detail}
          {sharedNote ? ` ${sharedNote}` : ""}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-relegation">
            {error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 rounded-lg border border-line font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={isPending}
            className="h-12 rounded-lg bg-accent font-semibold text-accent-ink disabled:opacity-60"
          >
            {isPending ? "Saving…" : confirm}
          </button>
        </div>
      </Sheet>
    </>
  );
}
