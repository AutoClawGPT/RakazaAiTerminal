import { NextResponse } from "next/server";

function notReady() {
  return NextResponse.json({ error: "not_implemented", message: "Tools API arrives in Phase 5.", phase: 5 }, { status: 501, headers: { "Cache-Control": "no-store" } });
}
export const GET = notReady;
export const POST = notReady;
