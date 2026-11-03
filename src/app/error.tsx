"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-3 px-4 py-8">
      <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted">Check your connection and try again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="h-13 rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
      >
        Try again
      </button>
      <Link href="/" className="py-2 text-center font-semibold underline">
        Go home
      </Link>
    </main>
  );
}
