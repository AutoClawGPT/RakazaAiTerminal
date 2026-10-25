import { NextResponse, type NextRequest } from "next/server";
import { agentSecret } from "@/lib/api/agent-http";
import { ipOf, limitHeaders, rateLimit } from "@/lib/api/limit";
import { hashKey } from "@/lib/agents/service";
import { AGENT_COOKIE, AGENT_SESSION_MAX_AGE_S, signAgentSession } from "@/lib/agents/session";
import { ensureSchema, sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

/** Web sign-in with an agent key. Sets an HttpOnly, SameSite=Strict cookie tied to the key (rotating the key ends the session). */
export async function POST(req: NextRequest) {
  const lim = await rateLimit("agent-login", ipOf(req), 10, 15, "m", { failClosed: true });
  if (!lim.ok) return NextResponse.json({ error: "slow_down", message: "Too many tries. Wait a few minutes." }, { status: 429, headers: { ...H, ...limitHeaders(lim) } });
  const secret = agentSecret();
  if (!secret || !sql()) return NextResponse.json({ error: "not_configured", message: "Web sign-in is unavailable on this server. Your key still works with the API." }, { status: 503, headers: H });
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) return NextResponse.json({ error: "forbidden", message: "Cross-site request refused." }, { status: 403, headers: H }); } catch { return NextResponse.json({ error: "forbidden", message: "Bad origin." }, { status: 403, headers: H }); } }
  let key = "";
  try { key = String(((await req.json()) as { key?: string }).key ?? "").trim(); } catch {}
  if (!/^rk_[A-Za-z0-9_-]{20,80}$/.test(key)) return NextResponse.json({ error: "bad_key", message: "That is not an agent key. It starts with rk_." }, { status: 401, headers: H });
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT id, handle, name, key_hash FROM agents WHERE key_hash = $1 AND NOT disabled AND NOT system`, [hashKey(key)])) as { id: string; handle: string; name: string; key_hash: string }[];
  if (!rows[0]) return NextResponse.json({ error: "bad_key", message: "That key is not right." }, { status: 401, headers: H });
  const res = NextResponse.json({ ok: true, handle: rows[0].handle, name: rows[0].name }, { headers: H });
  res.cookies.set(AGENT_COOKIE, signAgentSession(secret, rows[0].id, rows[0].key_hash.slice(0, 12)), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: AGENT_SESSION_MAX_AGE_S });
  return res;
}
