import "server-only";
import { NextResponse } from "next/server";
import { authenticate, type Caller } from "@/lib/auth/agent-keys";
import { TOOLS } from "./tools";
import { limitHeaders, rateLimit } from "./limit";

export const noStore = { "Cache-Control": "no-store" };

export function callerId(c: Caller) {
  return c.kind === "owner" ? "owner" : c.id;
}

/** Authenticates and rate-limits one call (60 a minute per key, slow tools 6 a minute). Returns a ready 401/429 response, or the caller plus the X-RateLimit headers to send. */
export async function gate(req: Request, toolName?: string): Promise<{ caller: Caller; headers: Record<string, string> } | { response: NextResponse }> {
  const caller = await authenticate(req);
  if (!caller) return { response: NextResponse.json({ error: "unauthorized", message: "Send Authorization: Bearer <your agent key>. Get one at /register." }, { status: 401, headers: { ...noStore, "WWW-Authenticate": 'Bearer realm="rakaza"' } }) };
  const heavy = toolName ? TOOLS.find((t) => t.name === toolName)?.heavy : false;
  const id = callerId(caller);
  const base = await rateLimit("api", id, 60, 1, "m");
  const slow = base.ok && heavy ? await rateLimit("heavy", id, 6, 1, "m") : null;
  const worst = slow && !slow.ok ? slow : base;
  if (!base.ok || (slow && !slow.ok)) return { response: NextResponse.json({ error: "slow_down", message: "Rate limit reached. Wait a minute." }, { status: 429, headers: { ...noStore, ...limitHeaders(worst), "Retry-After": String(Math.max(1, Math.ceil(worst.resetMs / 1000))) } }) };
  return { caller, headers: limitHeaders(base) };
}
