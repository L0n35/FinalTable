import { Suspense } from "react";
import Link from "next/link";
import { AccountStatus } from "@/components/account-status";
import { JoinCodeForm } from "@/components/join-code-form";
import { SiteFooter } from "@/components/legal-links";
import { YourLeagues } from "@/components/your-leagues";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-3 px-4 py-8">
      <h1 className="text-center font-display text-5xl font-bold">Final Table</h1>
      <p className="mb-6 text-center text-muted">
        Predict how the league will finish, then see who called it.
      </p>
      <Link
        href="/explore"
        className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
      >
        Explore leagues
      </Link>
      <Link
        href="/leagues/new"
        className="flex h-13 items-center justify-center rounded-lg border border-line font-semibold"
      >
        Create a group
      </Link>
      <JoinCodeForm />
      <Suspense>
        <YourLeagues />
      </Suspense>
      <Suspense fallback={<div className="h-13" />}>
        <AccountStatus />
      </Suspense>
      <Link href="/demo" className="mt-2 py-2 text-center text-sm text-muted underline">
        Try the demo
      </Link>
      <SiteFooter />
    </main>
  );
}
