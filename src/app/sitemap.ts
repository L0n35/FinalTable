import type { MetadataRoute } from "next";
import { readDirectory } from "@/lib/directory";
import { siteUrl } from "@/lib/site";

// Global leagues only. Groups are players' own, so they stay out of search results.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await readDirectory();
  const leagues = rows.flatMap((row) => (row.slug ? [{ url: siteUrl(`/leagues/${row.slug}`) }] : []));
  return [{ url: siteUrl("/") }, { url: siteUrl("/explore") }, { url: siteUrl("/demo") }, ...leagues];
}
