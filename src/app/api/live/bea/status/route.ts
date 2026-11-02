import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/owner";
import { beaConfig } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
/** Booleans only: is BEA configured for /live. */
export async function GET() {
  if (!(await isOwnerRequest())) return NextResponse.json({ owner: false });
  return NextResponse.json({ owner: true, bea: !!beaConfig() }, { headers: { "Cache-Control": "no-store" } });
}
