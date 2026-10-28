import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";
import { sql } from "@/lib/db";
import { agentsBoard, earningsBoard, launchesBoard } from "@/lib/leaderboards/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const H = { ...CORS, "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" };

/** GET /api/public/leaderboard/{agents|launches|earnings}?sort=&limit=&since=<rev>. The games board is /api/public/games/ride-em/leaderboard. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ tab: string }> }) {
  const { tab } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  if (!["agents", "launches", "earnings"].includes(tab)) return NextResponse.json({ error: "not_found", message: "Tabs: agents, launches, earnings. The games board is /api/public/games/ride-em/leaderboard." }, { status: 404, headers: CORS });
  if (!sql()) return NextResponse.json({ error: "unavailable", message: "The board is not available right now." }, { status: 503, headers: CORS });
  const limit = Number(sp.get("limit")) || undefined;
  const sort = sp.get("sort") ?? undefined;
  try {
    const b = tab === "agents" ? await agentsBoard({ sort, limit }) : tab === "launches" ? await launchesBoard({ sort, limit }) : await earningsBoard({ limit });
    if (sp.get("since") && sp.get("since") === b.rev) return NextResponse.json({ ok: true, unchanged: true, rev: b.rev }, { headers: H });
    return NextResponse.json(b, { headers: H });
  } catch { return NextResponse.json({ error: "server_error", message: "Try again." }, { status: 500, headers: CORS }); }
}
