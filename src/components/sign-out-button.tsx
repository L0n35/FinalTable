"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/app/auth/actions";

// Ends with a full page load, because the router keeps visited pages alive and they can hold private data.
export function SignOutButton() {
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        await signOut();
        window.location.replace("/");
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      className="h-11 shrink-0 rounded-lg border border-line px-4 font-semibold disabled:opacity-60"
    >
      {failed ? "Try again" : isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
