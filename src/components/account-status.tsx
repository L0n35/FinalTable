import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function AccountStatus() {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate">
        <span className="text-muted">Signed in as </span>
        <span className="font-semibold">{profile?.display_name ?? "Player"}</span>
      </p>
      <form action={signOut}>
        <button type="submit" className="h-11 shrink-0 rounded-lg border border-line px-4 font-semibold">
          Sign out
        </button>
      </form>
    </div>
  );
}
