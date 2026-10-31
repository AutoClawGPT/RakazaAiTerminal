import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/owner";
import { missingEnv } from "@/lib/live/signalwire-config";
import { mintGuestToken, serverConfig } from "@/lib/live/signalwire";

export const dynamic = "force-dynamic";

/** Owner-only: returns a 15-minute guest token that can only dial the Rakaza agent. */
export async function POST() {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "owner only" }, { status: 401 });
  const cfg = serverConfig();
  if (!cfg) return NextResponse.json({ error: "not configured", missing: missingEnv(process.env) }, { status: 503 });
  try {
    const t = await mintGuestToken(cfg);
    return NextResponse.json({ token: t.token, expiresAt: t.expiresAt, host: cfg.host, address: cfg.address }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
