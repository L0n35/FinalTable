"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Outcome = { ok: true } | { ok: false; error: string };

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
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
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccount(): Promise<Outcome | undefined> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    console.error("Account deletion failed:", error.message);
    return { ok: false, error: "We couldn't delete your account. Please try again." };
  }
  // Local only, because the session no longer exists on the server.
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}
