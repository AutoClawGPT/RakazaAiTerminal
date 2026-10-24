import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";

export const dynamic = "force-dynamic";

/** Public liveness. Booleans and labels only: never a key name list, never a value. */
export function GET() {
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
  return NextResponse.json(
    { ok: envValid, phase: 1, network, envValid, execute: execute ? "enabled" : "blocked" },
    { status: envValid ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
