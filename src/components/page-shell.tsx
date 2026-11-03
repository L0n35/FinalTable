import type { ReactNode } from "react";
import Link from "next/link";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      <header className="flex h-14 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" className="font-display text-2xl font-bold">
          Final Table
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
    </div>
  );
}
