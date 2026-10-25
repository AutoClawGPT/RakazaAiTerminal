import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { indexMint, refreshStats } from "@/lib/market/indexer";
import { syncAllAgentBuys } from "@/lib/community/calls";
import { backfillLaunchCallouts } from "@/lib/community/service";
import { publicEnv } from "@/lib/public-env";
import { PUBLIC_LAUNCH_STATUSES } from "@/lib/site";
import type { Network } from "@/lib/market/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const d = (v: string) => createHash("sha256").update(v).digest();
function allowed(req: NextRequest): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const got = d(m[1].trim());
  return [process.env.CRON_SECRET, process.env.API_SERVER_KEY].some((k) => !!k && k.length >= 16 && timingSafeEqual(got, d(k)));
}

/** Catches up the trade index and the cached stats for recent launches. Reads only; it never signs or sends anything. */
export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const q = sql();
  if (!q) return NextResponse.json({ ok: false, error: "No database." }, { status: 503 });
  try {
    await ensureSchema();
    const net = publicEnv.network as Network;
    const rows = (await q`SELECT mint FROM launches WHERE network = ${net} AND status = ANY(${[...PUBLIC_LAUNCH_STATUSES]}) ORDER BY created_at DESC LIMIT 60`) as unknown as { mint: string }[];
    const deadline = Date.now() + 45_000;
    let trades = 0;
    for (let i = 0; i < rows.length && Date.now() < deadline; i += 4) {
      const batch = rows.slice(i, i + 4);
      const r = await Promise.all(batch.map((b) => indexMint(net, b.mint, { maxSigs: 600, deadline }).catch(() => ({ newTrades: 0 }))));
      trades += r.reduce((a, x) => a + x.newTrades, 0);
    }
    await refreshStats(net, rows.map((r) => r.mint));
    // B6: turn real buys by verified agent wallets into Callout posts (best effort, never blocks the index run).
    let calls: { agents: number; posted: number } | null = null;
    if (Date.now() < deadline + 8_000) { try { calls = await syncAllAgentBuys(15); } catch { calls = null; } }
    try { await backfillLaunchCallouts(20); } catch { /* ignore */ }
    return NextResponse.json({ ok: true, tokens: rows.length, newTrades: trades, calls }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("cron index-trades failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
export const POST = GET;
