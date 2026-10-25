import type { MetadataRoute } from "next";
import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";

/** Owner / signed-in pages and the authenticated API stay out of search. Everything public is crawlable. */
export default function robots(): MetadataRoute.Robots {
  const private_ = ROUTES.filter((r) => r.access !== "P" && !r.path.startsWith("/api/") && r.path !== "/mcp" && !r.path.startsWith("/token/")).map((r) => r.path);
  const extra = ["/ledger", "/studio/owner", "/studio/mod", "/login", "/api/auth/", "/api/v1/", "/api/chat", "/api/voice", "/api/telegram/", "/api/cron/", "/mcp"];
  const disallow = [...new Set([...private_, ...extra])];
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/public/"], disallow }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
