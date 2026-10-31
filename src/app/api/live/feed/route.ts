import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PATHS: Record<string, string> = {
  tokens: "/api/public/tokens?limit=5",
  agents: "/api/public/leaderboard/agents?limit=4",
  community: "/api/public/community?limit=6",
};

/**
 * Live dashboard data: same-origin pass-through to the public API (read-only, public data).
 * LIVE_DATA_ORIGIN (optional, server env) reads another Rakaza deployment, e.g. production, when this host has no data of its own.
 */
export async function GET(req: NextRequest) {
  const path = PATHS[req.nextUrl.searchParams.get("kind") ?? ""];
  if (!path) return NextResponse.json({ error: "kind must be tokens, agents or community" }, { status: 400 });
  const origin = (process.env.LIVE_DATA_ORIGIN || req.nextUrl.origin).replace(/\/$/, "");
  if (!/^https?:\/\/[^/]+$/.test(origin)) return NextResponse.json({ error: "bad origin" }, { status: 500 });
  try {
    const r = await fetch(origin + path, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return NextResponse.json(await r.json(), { status: r.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "feed unavailable" }, { status: 502 });
  }
}
