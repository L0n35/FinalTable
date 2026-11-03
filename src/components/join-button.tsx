"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinLeague } from "@/app/leagues/actions";

export function JoinButton({
  leagueId,
  slug,
  joinCode,
  label,
  autoJoin = false,
}: {
  leagueId: string;
  slug: string;
  joinCode?: string;
  label: string;
  autoJoin?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const attempted = useRef(false);

  const join = () => {
    setError(null);
    startTransition(async () => {
      const result = await joinLeague(leagueId, joinCode);
      if (result.ok) {
        // Players go straight to making their prediction.
        router.replace(result.role === "player" ? `/leagues/${slug}/predict` : `/leagues/${slug}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };
  const joinRef = useRef(join);

  // Someone returning from sign-in has already chosen to join, so don't ask them twice.
  useEffect(() => {
    if (!autoJoin || attempted.current) return;
    attempted.current = true;
    joinRef.current();
  }, [autoJoin]);

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-relegation">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={join}
        disabled={isPending}
        className="h-13 w-full rounded-lg bg-accent font-display text-xl font-bold text-accent-ink disabled:opacity-60"
      >
        {isPending ? "Joining…" : label}
      </button>
    </div>
  );
}
