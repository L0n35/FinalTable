"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The layout guesses from the cookie before the first paint. This corrects it once the server has
// checked, including after signing out, which doesn't reload the page.
export function SessionMarker({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    document.documentElement.toggleAttribute("data-session", signedIn);
  }, [signedIn]);
  return null;
}

export function SignInLink() {
  const pathname = usePathname();
  const href = pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex h-11 items-center rounded-full border border-line bg-surface px-4 font-semibold"
    >
      Sign in
    </Link>
  );
}
