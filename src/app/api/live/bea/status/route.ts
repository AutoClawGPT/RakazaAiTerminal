import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/owner";
import { beaUp } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
/** Booleans only: is BEA configured and reachable (public, so every visitor gets her live stage). */
export async function GET() {
  const [owner, bea] = await Promise.all([isOwnerRequest(), beaUp()]);
  return NextResponse.json({ owner, bea }, { headers: { "Cache-Control": "no-store" } });
}
