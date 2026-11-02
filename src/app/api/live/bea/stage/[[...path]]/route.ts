import { isOwnerRequest } from "@/lib/owner";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * BEA's own OBS stage page (her real avatar: the model, moods and clips set in the BEA dashboard), served same-origin for the
 * /live iframe. BEA's absolute paths are rewritten under this prefix so its /stage/stream etc. go through our token proxy.
 *   /api/live/bea/stage            -> BEA /stage (html)
 *   /api/live/bea/stage/assets/*   -> BEA /assets/* (js/css, paths rewritten)
 *   /api/live/bea/stage/s/*        -> BEA /stage/* (config, model, clips, library, stream)
 */
const P = "/api/live/bea/stage";
const rewrite = (t: string) =>
  t
    .replaceAll('"/assets/', `"${P}/assets/`)
    .replaceAll('"/stage/', `"${P}/s/`)
    .replaceAll("`/stage/", `\`${P}/s/`)
    .replaceAll('"/"+', `"${P}/"+`);

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!(await isOwnerRequest())) return new Response("owner only", { status: 401 });
  if (!beaConfig()) return new Response("BEA not configured", { status: 503 });
  const parts = (await ctx.params).path ?? [];
  if (parts.some((p) => p === ".." || p.includes("/"))) return new Response("bad path", { status: 400 });
  const q = new URL(req.url).search;
  let up: string;
  if (!parts.length) up = "/stage";
  else if (parts[0] === "assets" && parts.length === 2) up = `/assets/${encodeURIComponent(parts[1])}`;
  else if (parts[0] === "s" && parts.length > 1) up = `/stage/${parts.slice(1).map(encodeURIComponent).join("/")}${q}`;
  else return new Response("not found", { status: 404 });
  const r = await beaFetch(up, { signal: req.signal }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("bea unavailable", { status: r?.status === 404 ? 404 : 502 });
  const ct = r.headers.get("content-type") ?? "application/octet-stream";
  const h = { "content-type": ct, "cache-control": "no-store, no-transform", "x-accel-buffering": "no" };
  if (/text\/html/.test(ct)) {
    // transparent over our /live scene: the iframe and this page both use color-scheme normal, so Chrome keeps the canvas see-through
    const html = rewrite(await r.text()).replace("</head>", "<style>:root,body{color-scheme:normal;background:transparent!important}</style></head>");
    return new Response(html, { headers: h });
  }
  if (/javascript|text\/css/.test(ct)) return new Response(rewrite(await r.text()), { headers: h });
  return new Response(r.body, { headers: h });
}
