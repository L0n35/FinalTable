import { Suspense } from "react";
import Link from "next/link";
import { SessionMarker, SignInLink } from "@/components/session-marker";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// A plain sign-in check with no database read, because this is on nearly every page.
async function NavAccount() {
  if (!isSupabaseConfigured) return null;
  const { userId } = await getSession();
  return (
    <>
      <SessionMarker signedIn={userId !== null} />
      {userId ? (
        <Link
          href="/account"
          aria-label="Your account"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5v1H4z" />
          </svg>
        </Link>
      ) : (
        <SignInLink />
      )}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="flex min-h-16 items-center justify-between gap-2 pt-[env(safe-area-inset-top)]">
      <Link href="/" className="poster text-2xl whitespace-nowrap">
        Final Table
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link href="/explore" className="flex h-11 items-center px-3 font-semibold">
          Explore
        </Link>
        <Suspense fallback={<span className="h-11 w-11" />}>
          <NavAccount />
        </Suspense>
      </nav>
    </header>
  );
}
