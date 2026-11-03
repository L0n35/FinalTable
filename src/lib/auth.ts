import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Cached per request, so everything on a page shares one sign-in check.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims.sub ?? null };
});

export type Session = Awaited<ReturnType<typeof getSession>>;

export async function isCurrentUserAdmin({ supabase, userId }: Session) {
  if (!userId) return false;
  const { data } = await supabase.rpc("current_user_is_admin");
  return data === true;
}
