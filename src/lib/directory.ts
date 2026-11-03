import { cacheLife, cacheTag } from "next/cache";
import type { DirectoryRow, PublicGroup } from "@/lib/directory-rows";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export const DIRECTORY_TAG = "directory";

// A plain fetch, because the Supabase client reads cookies and can't run in a cached scope.
async function callPublicFunction<Row>(name: string, body: Record<string, unknown> = {}): Promise<Row[]> {
  if (!isSupabaseConfigured) return [];
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Throwing means a failed read is never cached as an empty list, and fails a build rather than
  // publishing an empty page.
  if (!response.ok) throw new Error(`${name} failed with status ${response.status}`);
  return response.json();
}

// The same for everyone, so these answers are shared and the free database limits stay safe.
export async function readDirectory(): Promise<DirectoryRow[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });
  cacheTag(DIRECTORY_TAG);
  return callPublicFunction<DirectoryRow>("public_directory");
}

export async function readPublicGroups(minPlayers: number, limit: number): Promise<PublicGroup[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });
  cacheTag(DIRECTORY_TAG);
  return callPublicFunction<PublicGroup>("public_groups", { p_min_players: minPlayers, p_limit: limit });
}

export async function searchPublicGroups(query: string): Promise<PublicGroup[]> {
  return callPublicFunction<PublicGroup>("public_groups", { p_query: query, p_limit: 50 });
}
