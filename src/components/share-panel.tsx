"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { rotateJoinCode } from "@/app/leagues/actions";
import { copyText } from "@/lib/browser-utils";

const subscribeToNothing = () => () => {};

export function SharePanel({
  leagueId,
  leagueName,
  joinCode,
  canRotate,
  closed = false,
}: {
  leagueId: string;
  leagueName: string;
  joinCode: string;
  canRotate: boolean;
  // Predictions have locked, so anyone invited now can only follow along.
  closed?: boolean;
}) {
  const [code, setCode] = useState(joinCode);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
  const link = `${origin}/join/${code}`;
  const heading = closed ? "Invite friends" : "Invite players";

  const share = async () => {
    setNotice(null);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${leagueName} on Final Table`, url: link });
      } catch {
        // Closing the share dialog rejects, and there is nothing to report.
      }
      return;
    }
    setNotice((await copyText(link)) ? "Link copied" : "Couldn't copy. Please select the link above.");
  };

  const rotate = () => {
    if (!window.confirm("Replace this code? The current link and code will stop working for new players.")) {
      return;
    }
    startTransition(async () => {
      const result = await rotateJoinCode(leagueId);
      if (result.ok) {
        setCode(result.code);
        setNotice("New code created");
      } else {
        setNotice(result.error);
      }
    });
  };

  return (
    <section aria-label={heading} className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-xl font-bold">{heading}</h2>
      {closed && <p className="text-sm text-muted">Predictions have closed, but they can still follow along.</p>}
      <p className="mt-2 text-sm text-muted">Join code</p>
      <p className="font-display text-3xl font-bold tracking-widest" data-testid="join-code">
        {code}
      </p>
      <p className="mt-2 text-sm break-all text-muted select-all">{link}</p>
      <button
        type="button"
        onClick={share}
        className="mt-3 h-12 w-full rounded-lg bg-accent font-semibold text-accent-ink"
      >
        Share link
      </button>
      <p aria-live="polite" className="mt-2 text-center text-sm text-muted empty:hidden">
        {notice}
      </p>
      {canRotate && (
        <button
          type="button"
          onClick={rotate}
          disabled={isPending}
          className="mt-1 h-11 w-full text-sm font-semibold text-muted underline"
        >
          Replace code
        </button>
      )}
    </section>
  );
}
