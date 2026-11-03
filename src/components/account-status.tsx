import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function AccountStatus() {
  if (!isSupabaseConfigured) return null;

  const session = await getSession();
  const { supabase, userId } = session;

  if (!userId) return null;

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
        <SignOutButton />
      </div>
    </>
  );
}
