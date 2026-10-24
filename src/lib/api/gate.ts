import "server-only";
import { NextResponse } from "next/server";
import { authenticate, type Caller } from "@/lib/auth/agent-keys";
import { allow } from "@/lib/auth/rate";
import { TOOLS } from "./tools";

export const noStore = { "Cache-Control": "no-store" };

export function callerId(c: Caller) {
  return c.kind === "owner" ? "owner" : c.id;
}

/** Authenticates and rate-limits one tool call. Returns a ready 401/429 response, or the caller. */
export async function gate(req: Request, toolName?: string): Promise<{ caller: Caller } | { response: NextResponse }> {
  const caller = await authenticate(req);
  if (!caller) return { response: NextResponse.json({ error: "unauthorized", message: "Send Authorization: Bearer <your agent key>. Get one at /register." }, { status: 401, headers: { ...noStore, "WWW-Authenticate": 'Bearer realm="rakaza"' } }) };
  const heavy = toolName ? TOOLS.find((t) => t.name === toolName)?.heavy : false;
  const id = callerId(caller);
  const ok = allow(`api:${id}`, 60, 60_000) && (!heavy || allow(`heavy:${id}`, 6, 60_000));
  if (!ok) return { response: NextResponse.json({ error: "slow_down", message: "Rate limit reached. Wait a minute." }, { status: 429, headers: { ...noStore, "Retry-After": "60" } }) };
  return { caller };
}
