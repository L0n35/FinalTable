"use client";

import { useState, useTransition, type FormEvent } from "react";
import { deleteAccount, updateDisplayName } from "@/app/auth/actions";
import { Sheet } from "@/components/sheet";
import { Field, inputClass } from "@/components/wizard/fields";

const OFFLINE = "We couldn't reach the server. Please try again.";

export function AccountSettings({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  const trimmed = name.trim();

  const save = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    startSaving(async () => {
      const result = await updateDisplayName(trimmed).catch(() => ({ ok: false as const, error: OFFLINE }));
      if (result.ok) {
        setName(trimmed);
        setSavedName(trimmed);
        setNotice("Name saved");
      } else {
        setError(result.error);
      }
    });
  };

  const remove = () => {
    setDeleteError(null);
    startDeleting(async () => {
      // On success this redirects home, so only a failure comes back.
      const result = await deleteAccount().catch(() => ({ ok: false as const, error: OFFLINE }));
      if (result && !result.ok) setDeleteError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Display name" hint="Other players see this on leaderboards." htmlFor="display-name">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setNotice(null);
            }}
            className={inputClass}
          />
        </Field>
        {error && (
          <p role="alert" className="text-relegation">
            {error}
          </p>
        )}
        <p aria-live="polite" className="text-sm text-muted empty:hidden">
          {notice}
        </p>
        <button
          type="submit"
          disabled={isSaving || trimmed === "" || trimmed === savedName}
          className="h-12 rounded-lg bg-accent font-semibold text-accent-ink disabled:bg-surface-raised disabled:text-muted"
        >
          {isSaving ? "Saving…" : "Save name"}
        </button>
      </form>

      <section aria-label="Delete account" className="rounded-lg border border-line p-4">
        <h2 className="font-display text-xl font-bold">Delete account</h2>
        <p className="mt-1 text-sm text-muted">
          This permanently removes your profile and predictions, and takes you off every leaderboard.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 h-12 w-full rounded-lg border border-line font-semibold text-relegation"
        >
          Delete my account
        </button>
      </section>

      <Sheet open={confirming} label="Delete your account?" onClose={() => setConfirming(false)}>
        <h2 className="font-display text-2xl font-bold">Delete your account?</h2>
        <p className="mt-1 text-muted">
          This can&apos;t be undone. Groups nobody else is in are deleted. Groups with other people carry on and pass to
          their longest-standing member.
        </p>
        {deleteError && (
          <p role="alert" className="mt-2 text-relegation">
            {deleteError}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-12 rounded-lg border border-line font-semibold"
          >
            Keep account
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isDeleting}
            className="h-12 rounded-lg bg-relegation font-semibold text-background disabled:opacity-60"
          >
            {isDeleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
