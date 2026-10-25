import type { NextRequest } from "next/server";
import { fail, guard, ok, preflight } from "@/lib/market/http";
import { tradesFor } from "@/lib/market/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { limited, headers } = await guard(req, "trades", 120);
  if (limited) return limited;
  const { mint } = await ctx.params;
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10) || 30));
  try {
    const r = await tradesFor(mint, limit);
    if (!r) return fail(404, "not_found", "No token with that address was launched through Rakaza.");
    return ok({ ok: true, mint, trades: r.trades }, headers, 3);
  } catch (e) {
    console.error("public trades failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return fail(503, "unavailable", "Trades could not be loaded right now.");
  }
}
