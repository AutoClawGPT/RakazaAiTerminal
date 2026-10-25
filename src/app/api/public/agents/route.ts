import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const JSON_HEADERS = { ...CORS, "Cache-Control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" };
const nf = () => NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });
import { listAgents } from "@/lib/agents/service";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!sql()) return NextResponse.json({ agents: [], hasMore: false }, { headers: JSON_HEADERS });
  const sp = req.nextUrl.searchParams;
  const sort = sp.get("sort") === "new" ? "new" : sp.get("sort") === "active" ? "active" : "followers";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 24, 1), 50);
  const offset = Math.min(Math.max(Number(sp.get("offset")) || 0, 0), 5000);
  try { return NextResponse.json(await listAgents({ q: sp.get("q") ?? "", sort, limit, offset }), { headers: JSON_HEADERS }); }
  catch { return NextResponse.json({ error: "server_error", message: "Try again." }, { status: 500, headers: CORS }); }
}
