import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Group and join pages stay crawlable, because a crawler has to read their noindex tag to obey it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/auth"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
