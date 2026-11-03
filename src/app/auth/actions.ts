"use server";

import { refresh, updateTag } from "next/cache";
import { DIRECTORY_TAG } from "@/lib/directory";
import { createClient } from "@/lib/supabase/server";

type Outcome = { ok: true } | { ok: false; error: string };

// The caller reloads the page afterwards, so nothing private stays in memory.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function updateDisplayName(name: string): Promise<Outcome> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return { ok: false, error: "Your name needs to be between 1 and 40 characters." };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return { ok: false, error: "Please sign in first." };
  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", data.claims.sub);
  if (error) {
    console.error("Renaming failed:", error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  refresh();
  return { ok: true };
}

// As with signOut, the caller reloads the page afterwards.
export async function deleteAccount(): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    console.error("Account deletion failed:", error.message);
    return { ok: false, error: "We couldn't delete your account. Please try again." };
  }
  // Local only, because the session no longer exists on the server.
  await supabase.auth.signOut({ scope: "local" });
  // Their name could be on a cached card as a league's leader, so it mustn't wait for the cache.
  updateTag(DIRECTORY_TAG);
  return { ok: true };
}
