import type { NextRequest } from "next/server";
import { fail, guard, ok, preflight } from "@/lib/market/http";
import { getCandles } from "@/lib/market/tokens";
import { INTERVALS, type Interval } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { limited, headers } = await guard(req, "candles", 120);
  if (limited) return limited;
  const { mint } = await ctx.params;
  const interval = (req.nextUrl.searchParams.get("interval") ?? "1m") as Interval;
  if (!(interval in INTERVALS)) return fail(400, "bad_interval", `interval must be one of ${Object.keys(INTERVALS).join(", ")}.`);
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10) || 200));
  try {
    const r = await getCandles(mint, interval, limit);
    if (!r) return fail(404, "not_found", "No token with that address was launched through Rakaza.");
    return ok({ ok: true, mint, interval, unit: "SOL", source: r.source, candles: r.candles }, headers, 3);
  } catch (e) {
    console.error("public candles failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return fail(503, "unavailable", "Candles could not be loaded right now.");
  }
}
