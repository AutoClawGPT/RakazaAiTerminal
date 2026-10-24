import { NextResponse, type NextRequest } from "next/server";
import { treasuryHealth } from "@/lib/api/chain-tools";
import { getEnv } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";

export const dynamic = "force-dynamic";

/** Public liveness. Booleans and labels only: never a key name list, never a value. */
export async function GET(req: NextRequest) {
  let envValid = true;
  let execute = false;
  let network: string = "unknown";
  try {
    const env = getEnv();
    network = env.NEXT_PUBLIC_SOLANA_NETWORK;
    execute = isExecuteEnabled();
  } catch {
    envValid = false;
  }
  let treasury: { ok: boolean; rpc: boolean; signerReady: boolean; funded: boolean; database: boolean } | undefined;
  if (envValid && req.nextUrl.searchParams.get("deep") === "1") {
    try {
      const h = await treasuryHealth();
      treasury = { ok: h.ok, rpc: !!h.rpc?.ok, signerReady: !!h.signerReady, funded: (h.balanceSol ?? 0) >= 0.05, database: !!h.database };
    } catch { treasury = { ok: false, rpc: false, signerReady: false, funded: false, database: false }; }
  }
  return NextResponse.json(
    { ok: envValid, phase: 1, network, envValid, execute: execute ? "enabled" : "blocked", ...(treasury ? { treasury } : {}) },
    { status: envValid ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
