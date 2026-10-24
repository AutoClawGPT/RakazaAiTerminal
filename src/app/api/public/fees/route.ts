import { NextResponse, type NextRequest } from "next/server";
import { walletFees } from "@/lib/api/chain-tools";
import { isSolanaAddress } from "@/lib/tools/address";
import { limiter } from "@/lib/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function memOk(id: string) {
  const now = Date.now();
  const h = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  h.push(now);
  hits.set(id, h);
  return h.length <= 30;
}

/** Anyone can check what a wallet has earned from tokens launched here. Fee data is public on-chain, so no login is needed. */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const lim = limiter("pubfees", 30, "1 m");
  if (!(lim ? (await lim.limit(ip)).success : memOk(ip))) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  if (!isSolanaAddress(wallet)) return NextResponse.json({ ok: false, error: "A valid wallet address is required, as ?wallet=ADDRESS." }, { status: 400 });
  try {
    const r = await walletFees(wallet);
    return NextResponse.json(r, { status: r.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read fees right now." }, { status: 503 });
  }
}
