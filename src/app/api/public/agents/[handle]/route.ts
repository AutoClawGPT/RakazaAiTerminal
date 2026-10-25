import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const JSON_HEADERS = { ...CORS, "Cache-Control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" };
const nf = () => NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });
import { getPublicAgent, tokensOfAgent, agentByHandle } from "@/lib/agents/service";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/public/agents/[handle]">) {
  if (!sql()) return nf();
  const { handle } = await ctx.params;
  const a = await getPublicAgent(handle);
  if (!a) return nf();
  const row = await agentByHandle(handle);
  const tokens = row ? await tokensOfAgent(row) : [];
  return NextResponse.json({ agent: a, tokens }, { headers: JSON_HEADERS });
}
