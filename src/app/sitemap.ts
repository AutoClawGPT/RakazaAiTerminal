import type { MetadataRoute } from "next";
import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";
import { listPublicMints } from "@/lib/market/counts";
import { listAgents } from "@/lib/agents/service";
import { sql } from "@/lib/db";
import { MEME_ITEMS } from "@/lib/memes";

/** Rebuilt at most every 10 minutes: public pages plus one entry per launched token. */
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ROUTES.filter((r) => r.access === "P" && !r.hidden && !r.raw && !r.api && r.group !== "system" && r.path !== "/login")
    .map((r) => ({ url: `${base}${r.path === "/" ? "" : r.path}`, changeFrequency: (r.path === "/explore" ? "always" : "weekly") as "always" | "weekly", priority: r.path === "/" ? 1 : r.path === "/explore" ? 0.9 : 0.6 }));
  const mints = await listPublicMints(500);
  const tokens = mints.map((m) => ({ url: `${base}/token/${m.mint}`, lastModified: m.createdAt, changeFrequency: "hourly" as const, priority: 0.5 }));
  const agents = sql() ? await listAgents({ sort: "followers", limit: 200, offset: 0 }).then((r) => r.agents.map((a) => ({ url: `${base}/agents/${a.handle}`, changeFrequency: "daily" as const, priority: 0.4 }))).catch(() => []) : [];
  const memes = MEME_ITEMS.map((m) => ({ url: `${base}/memes/${m.id}`, changeFrequency: "monthly" as const, priority: 0.3 }));
  return [...pages, ...memes, ...tokens, ...agents];
}
