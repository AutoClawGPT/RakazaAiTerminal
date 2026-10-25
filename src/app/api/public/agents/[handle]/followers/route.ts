import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const JSON_HEADERS = { ...CORS, "Cache-Control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" };
const nf = () => NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });
import { followList } from "@/lib/agents/service";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/public/agents/[handle]/followers">) {
  if (!sql()) return nf();
  const { handle } = await ctx.params;
  const dir = req.nextUrl.searchParams.get("dir") === "following" ? "following" : "followers";
  return NextResponse.json({ handle, dir, agents: await followList(handle, dir) }, { headers: JSON_HEADERS });
}
