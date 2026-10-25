import { NextResponse, type NextRequest } from "next/server";
import { ACTIONS, runAction } from "@/lib/api/agent-actions";
import { cookieAgent, isBadJson, NO_STORE, readJson, respond } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same actions the API and MCP offer, for the signed-in web user (cookie). Same-origin only: no CORS headers are sent. */
async function handle(req: NextRequest, ctx: RouteContext<"/api/public/me/[action]">, write: boolean) {
  const { action } = await ctx.params;
  if (!(action in ACTIONS)) return NextResponse.json({ error: "unknown_action", message: "No such action." }, { status: 404, headers: NO_STORE });
  const a = await cookieAgent(req, { write });
  if ("response" in a) return a.response;
  let input: unknown = {};
  if (write) { input = await readJson(req); if (isBadJson(input)) return NextResponse.json({ error: "bad_json", message: "Send a JSON body." }, { status: 400, headers: NO_STORE }); }
  else input = Object.fromEntries(req.nextUrl.searchParams);
  return respond(await runAction(action, a.agent, input));
}
export async function GET(req: NextRequest, ctx: RouteContext<"/api/public/me/[action]">) { return handle(req, ctx, false); }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/public/me/[action]">) { return handle(req, ctx, true); }
