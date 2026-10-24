import { NextResponse } from "next/server";
import { callTool } from "@/lib/api/tools";
import { gate, noStore } from "@/lib/api/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  const g = await gate(req, tool);
  if ("response" in g) return g.response;
  let body: unknown = {};
  try { body = await req.json(); } catch {}
  const r = await callTool(tool, body, g.caller);
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status, headers: noStore });
  return NextResponse.json({ result: r.result }, { headers: noStore });
}
