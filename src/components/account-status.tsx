import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function AccountStatus() {
  if (!isSupabaseConfigured) return null;

  const session = await getSession();
  const { supabase, userId } = session;

  if (!userId) {
    return (
      <Link
        href="/login"
        className="flex h-13 items-center justify-center rounded-lg border border-line font-semibold"
      >
        Sign in
      </Link>
    );
  }

  const [{ data: profile }, isAdmin] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    isCurrentUserAdmin(session),
  ]);

  return (
    <>
      {isAdmin && (
        <Link
          href="/admin"
          className="flex h-12 items-center justify-center rounded-lg border border-line font-semibold"
        >
          Admin
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <Link href="/account" aria-label="Your account" className="min-w-0 truncate py-2">
          <span className="text-muted">Signed in as </span>
          <span className="font-semibold underline">{profile?.display_name ?? "Player"}</span>
        </Link>
        <form action={signOut}>
          <button type="submit" className="h-11 shrink-0 rounded-lg border border-line px-4 font-semibold">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
