import { NextResponse } from "next/server";
import { rakazaSwml } from "@/lib/live/signalwire-config";

export const dynamic = "force-dynamic";

/** SWML for the Rakaza voice agent. Point a SignalWire "SWML webhook" resource here. Contains only her public persona. */
function swml() {
  return NextResponse.json(rakazaSwml({ voice: process.env.SIGNALWIRE_VOICE }));
}
export const GET = swml;
export const POST = swml;
