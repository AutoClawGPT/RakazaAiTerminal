import { NextResponse, type NextRequest } from "next/server";
import { bearerAgent, cookieAgent, isBadJson, NO_STORE, readJson } from "@/lib/api/agent-http";
import { limitHeaders, rateLimit } from "@/lib/api/limit";
import { cleanObs, decide, listModels, MAX_BODY, modelChoices, RATE, SAMPLE } from "@/lib/games/ride-em/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** River brain for the game. Sign-in required (same-origin cookie or an agent key). Never returns an error the game cannot survive: it answers {fallback:true,reason}. */
async function who(req: NextRequest, write: boolean) {
  if (/^Bearer\s+\S+/i.test(req.headers.get("authorization") ?? "")) { const a = await bearerAgent(req); return "response" in a ? a : { agent: a.agent }; }
  return cookieAgent(req, { write });
}

export async function GET(req: NextRequest) {
  const a = await who(req, false);
  if ("response" in a) return a.response;
  if (req.nextUrl.searchParams.get("models") !== "1") return NextResponse.json({ service: "river-brain", protocol: "rakaza-games/1", auth: "required" }, { headers: NO_STORE });
  try { return NextResponse.json({ models: modelChoices(await listModels()) }, { headers: NO_STORE }); } catch { return NextResponse.json({ fallback: true, reason: "river model list unavailable" }, { headers: NO_STORE }); }
}

export async function POST(req: NextRequest) {
  const a = await who(req, true);
  if ("response" in a) return a.response;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return NextResponse.json({ fallback: true, reason: "body too large" }, { status: 413, headers: NO_STORE });
  const lim = await rateLimit("game-brain", a.agent.id, RATE.max, RATE.windowMin, "m");
  if (!lim.ok) return NextResponse.json({ fallback: true, reason: `rate limited (${RATE.max}/min)` }, { status: 429, headers: { ...NO_STORE, ...limitHeaders(lim) } });
  const body = await readJson(req);
  if (isBadJson(body) || body === null || typeof body !== "object" || JSON.stringify(body).length > MAX_BODY) return NextResponse.json({ fallback: true, reason: "bad json or too large" }, { status: 400, headers: NO_STORE });
  const b = body as { test?: boolean; obs?: unknown; model?: unknown };
  const obs = b.test ? cleanObs(SAMPLE) : cleanObs(b.obs);
  if (!obs) return NextResponse.json({ fallback: true, reason: "bad observation" }, { status: 400, headers: NO_STORE });
  try { return NextResponse.json(await decide(obs, b.model), { headers: NO_STORE }); } catch { return NextResponse.json({ fallback: true, reason: "function error" }, { headers: NO_STORE }); }
}
