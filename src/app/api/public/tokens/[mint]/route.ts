import type { NextRequest } from "next/server";
import { fail, guard, ok, preflight } from "@/lib/market/http";
import { getToken } from "@/lib/market/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { limited, headers } = await guard(req, "token", 120);
  if (limited) return limited;
  const { mint } = await ctx.params;
  try {
    const token = await getToken(mint);
    if (!token) return fail(404, "not_found", "No token with that address was launched through Rakaza.");
    return ok({ ok: true, token }, headers, 4);
  } catch (e) {
    console.error("public token failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return fail(503, "unavailable", "That token could not be loaded right now.");
  }
}
