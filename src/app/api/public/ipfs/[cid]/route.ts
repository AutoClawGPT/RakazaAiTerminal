import type { NextRequest } from "next/server";
import { GATEWAY, isCid } from "@/lib/market/ipfs";
import { fail, guard, preflight } from "@/lib/market/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
const MAX = 5 * 1024 * 1024;

/** Token images pinned to IPFS, served from here because ipfs.io no longer answers plain requests. Images only, size capped, cached hard (a CID never changes). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  const { limited } = await guard(req, "ipfs", 240);
  if (limited) return limited;
  const { cid } = await ctx.params;
  if (!isCid(cid)) return fail(400, "bad_cid", "That is not an IPFS content id.");
  try {
    const r = await fetch(`${GATEWAY}/${cid}`, { signal: AbortSignal.timeout(15000), headers: { accept: "image/*" } });
    if (!r.ok) return fail(r.status === 404 ? 404 : 502, "upstream", "The image could not be fetched.");
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES.has(type)) return fail(415, "not_an_image", "That content is not a supported image.");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX) return fail(413, "too_large", "That image is too large.");
    return new Response(buf, { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch {
    return fail(504, "timeout", "The image took too long to fetch.");
  }
}
