import { NextResponse } from "next/server";

/** Reached only with a valid bearer key (src/proxy.ts denies everything else with 401). */
function notReady() {
  return NextResponse.json(
    { error: "not_implemented", message: "The MCP server is built in Phase 5.", phase: 5 },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = notReady;
export const POST = notReady;
export const DELETE = notReady;
