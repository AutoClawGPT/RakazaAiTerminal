import type { NextRequest } from "next/server";
import { topHolders } from "@/lib/market/holders";
import { fail, guard, ok, preflight } from "@/lib/market/http";
import { networkOf } from "@/lib/market/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { limited, headers } = await guard(req, "holders", 30);
  if (limited) return limited;
  const { mint } = await ctx.params;
  try {
    const net = await networkOf(mint);
    if (!net) return fail(404, "not_found", "No token with that address was launched through Rakaza.");
    const holders = await topHolders(net, mint.trim());
    if (!holders) return fail(503, "unavailable", "Holders could not be read right now.");
    return ok({ ok: true, mint: mint.trim(), holders }, headers, 15);
  } catch (e) {
    console.error("public holders failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return fail(503, "unavailable", "Holders could not be read right now.");
  }
}
