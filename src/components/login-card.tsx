"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function LoginCard() {
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [failed, setFailed] = useState(searchParams.has("error"));

  const signIn = async () => {
    setIsRedirecting(true);
    setFailed(false);
    const next = safeNextPath(searchParams.get("next"));
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setFailed(true);
      setIsRedirecting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return <p className="text-center text-muted">Sign-in isn&apos;t set up yet.</p>;
  }

  return (
    <>
      {failed && (
        <p role="alert" className="mb-3 text-center text-relegation">
          That didn&apos;t work. Please try again.
        </p>
      )}
      <button
        type="button"
        onClick={signIn}
        disabled={isRedirecting}
        className="flex h-13 w-full items-center justify-center gap-3 rounded-lg bg-white font-semibold text-[#1f1f1f] disabled:opacity-70"
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.2 5.5-4.7 7.2l7.7 6c4.5-4.2 7-10.3 7-17.7z" />
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {isRedirecting ? "Opening Google…" : "Continue with Google"}
      </button>
    </>
  );
}
