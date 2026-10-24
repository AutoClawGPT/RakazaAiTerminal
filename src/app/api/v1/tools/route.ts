import { NextResponse } from "next/server";

/** Reached only with a valid bearer key (src/proxy.ts). Implemented in Phase 5. */
export function GET() {
  return NextResponse.json({ error: "not_implemented", message: "Tools API arrives in Phase 5.", phase: 5 }, { status: 501, headers: { "Cache-Control": "no-store" } });
}
