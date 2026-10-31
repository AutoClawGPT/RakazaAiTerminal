import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/owner";
import { missingEnv } from "@/lib/live/signalwire-config";

export const dynamic = "force-dynamic";

/** Booleans only: is the caller the owner, and which env names (never values) are still missing. */
export async function GET() {
  const owner = await isOwnerRequest();
  if (!owner) return NextResponse.json({ owner: false });
  return NextResponse.json({ owner: true, missing: missingEnv(process.env) }, { headers: { "Cache-Control": "no-store" } });
}
