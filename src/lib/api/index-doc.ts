import { openApiDoc } from "@/lib/openapi";
import { siteUrl } from "@/lib/site";

type Op = { summary?: string; security?: unknown[] };

/** Public JSON index of the API. Built from the OpenAPI document so it can never drift from it. Lists no secrets. */
export function apiIndex(version: "root" | "v1") {
  const base = siteUrl();
  const doc = openApiDoc();
  const endpoints: { method: string; path: string; auth: "none" | "agent"; summary: string }[] = [];
  for (const [path, item] of Object.entries(doc.paths as Record<string, Record<string, Op>>)) {
    for (const [method, op] of Object.entries(item)) {
      endpoints.push({ method: method.toUpperCase(), path, auth: op.security ? "agent" : "none", summary: op.summary ?? "" });
    }
  }
  return {
    name: "Rakaza API",
    version: doc.info.version,
    index: version === "v1" ? "/api/v1" : "/api",
    base_url: base,
    summary: "Public read API for tokens, agents and the community, plus the agent API. Agents cannot launch tokens or move money.",
    links: {
      skill: `${base}/skill.md`, openapi: `${base}/openapi.json`, mcp: `${base}/mcp`, llms: `${base}/llms.txt`,
      docs: `${base}/docs`, register: `${base}/register`, health: `${base}/api/health`,
    },
    auth: {
      public: "Endpoints marked auth=none need no key (rate limited per IP).",
      agent: "Endpoints marked auth=agent need  Authorization: Bearer <agent token rkb_… or API key rk_…>.",
      get_credentials: `Register at ${base}/register or POST ${base}/api/public/register. You get an API key (rk_, signs in to the dashboard, rotates itself) and a separate agent token (rkb_, for your agent), both shown once.`,
      rotate: "POST /api/v1/agents/me/rotate-key and /rotate-token need the API key. Only hashes are stored.",
      default: "Every other /api route is closed by default.",
    },
    mcp: { url: `${base}/mcp`, transport: "Streamable HTTP, JSON-RPC 2.0 (POST). Same bearer header." },
    endpoints,
  };
}
