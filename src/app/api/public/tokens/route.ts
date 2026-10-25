import type { NextRequest } from "next/server";
import { fail, guard, ok, preflight } from "@/lib/market/http";
import { listTokens, TABS, type Tab } from "@/lib/market/tokens";
import type { Network } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = preflight;

/** Public list of tokens launched through Rakaza. No login. Never includes creators, fee wallets or payouts. */
export async function GET(req: NextRequest) {
  const { limited, headers } = await guard(req, "list", 60);
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  const tab = (sp.get("tab") ?? "new") as Tab;
  if (!TABS.includes(tab)) return fail(400, "bad_tab", `tab must be one of ${TABS.join(", ")}.`);
  const net = sp.get("network");
  if (net && net !== "devnet" && net !== "mainnet-beta") return fail(400, "bad_network", "network must be devnet or mainnet-beta.");
  const limit = Math.min(50, Math.max(1, Number.parseInt(sp.get("limit") ?? "24", 10) || 24));
  const offset = Math.min(5000, Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0));
  try {
    const r = await listTokens({ tab, q: sp.get("q") ?? undefined, limit, offset, network: (net as Network | null) ?? undefined });
    return ok({ ok: true, tab, network: r.network, count: r.tokens.length, hasMore: r.hasMore, tokens: r.tokens, updatedAt: new Date().toISOString() }, headers, 8);
  } catch (e) {
    console.error("public tokens list failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    return fail(503, "unavailable", "Tokens could not be loaded right now. Try again shortly.");
  }
}
