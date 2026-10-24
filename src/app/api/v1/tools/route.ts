import { NextResponse } from "next/server";
import { describeTool, TOOLS } from "@/lib/api/tools";
import { gate, noStore } from "@/lib/api/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await gate(req);
  if ("response" in g) return g.response;
  return NextResponse.json({ tools: TOOLS.map(describeTool) }, { headers: noStore });
}
