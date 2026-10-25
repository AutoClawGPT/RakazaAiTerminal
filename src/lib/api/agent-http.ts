import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { gate } from "./gate";
import { runAction, type ActionResult } from "./agent-actions";
import { limitHeaders } from "./limit";
import { agentById, type AgentRow } from "@/lib/agents/service";
import { AGENT_COOKIE, verifyAgentSession } from "@/lib/agents/session";
import { createHash } from "node:crypto";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
  "Access-Control-Max-Age": "86400",
};
export const NO_STORE = { "Cache-Control": "no-store" };

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function respond(r: ActionResult, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(r.body, { status: r.status, headers: { ...NO_STORE, ...extra, ...(r.limit ? limitHeaders(r.limit) : {}) } });
}

export async function readJson(req: Request): Promise<unknown> {
  try { const t = await req.text(); return t ? JSON.parse(t) : {}; } catch { return Symbol.for("bad-json"); }
}
export const isBadJson = (v: unknown) => v === Symbol.for("bad-json");

/** Bearer-key caller as a full agent row. The owner key is not an agent. */
export async function bearerAgent(req: Request): Promise<{ agent: AgentRow; headers: Record<string, string> } | { response: NextResponse }> {
  const g = await gate(req);
  if ("response" in g) return { response: withCors(g.response) };
  if (g.caller.kind !== "agent") return { response: NextResponse.json({ error: "forbidden", message: "This route needs an agent key (rk_…), not the owner key." }, { status: 403, headers: { ...NO_STORE, ...CORS } }) };
  const agent = await agentById(g.caller.id);
  if (!agent) return { response: NextResponse.json({ error: "unauthorized", message: "Agent not found." }, { status: 401, headers: { ...NO_STORE, ...CORS } }) };
  return { agent, headers: { ...CORS, ...g.headers } };
}

function withCors(r: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

/** One-line REST route for a Bearer action. */
export async function bearerAction(req: Request, action: string, input: unknown): Promise<NextResponse> {
  const a = await bearerAgent(req);
  if ("response" in a) return a.response;
  return respond(await runAction(action, a.agent, input), a.headers);
}

/** Same-origin web caller: the signed HttpOnly cookie. Rejects cross-site requests (cookie is SameSite=Strict, and Origin must match). */
export async function cookieAgent(req: NextRequest | Request, opts: { write: boolean }): Promise<{ agent: AgentRow } | { response: NextResponse }> {
  const unauth = (m: string, s = 401) => ({ response: NextResponse.json({ error: s === 403 ? "forbidden" : "unauthorized", message: m }, { status: s, headers: NO_STORE }) });
  if (opts.write) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin) { try { if (new URL(origin).host !== host) return unauth("Cross-site request refused.", 403); } catch { return unauth("Bad origin.", 403); } }
    if (!(req.headers.get("content-type") ?? "").includes("json")) return unauth("Send JSON.", 403);
  }
  const jar = await cookies();
  const s = verifyAgentSession(jar.get(AGENT_COOKIE)?.value, agentSecret() ?? undefined);
  if (!s) return unauth("Sign in with your agent key.");
  const agent = await agentById(s.id);
  if (!agent || agent.key_hash.slice(0, 12) !== s.keyTag) return unauth("Session ended. Sign in again.");
  return { agent };
}

/** Signing secret for the agent web session: SESSION_SECRET, or (if that is not set) a value derived from the database URL. Never leaves the server. */
export function agentSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  const d = process.env.DATABASE_URL;
  return d ? createHash("sha256").update("agent-session-fallback:" + d).digest("hex") : null;
}
