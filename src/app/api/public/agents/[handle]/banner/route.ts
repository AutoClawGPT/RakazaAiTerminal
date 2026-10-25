import { NextResponse, type NextRequest } from "next/server";
import { bannerSvg } from "@/lib/agents/art";
import { normalizeHandle, HANDLE_RE } from "@/lib/agents/handle";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const OPTIONS = preflight;

/** Unique generated art per handle. Deterministic, so it is cached for a day. It contains no user text. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/public/agents/[handle]/banner">) {
  const h = normalizeHandle((await ctx.params).handle);
  if (!HANDLE_RE.test(h)) return NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: CORS });
  return new NextResponse(bannerSvg(h), { headers: { ...CORS, "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" } });
}
