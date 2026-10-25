import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { registerProfile } from "@/lib/agents/service";
import { getEnv } from "@/lib/env";

export type Caller = { kind: "owner" } | { kind: "agent"; id: string; name: string; via?: "key" | "token" };

const hash = (k: string) => createHash("sha256").update(k).digest("hex");

/** Name-only registration (the original flow). Now also creates a profile handle, so old callers keep working unchanged. */
export async function registerAgent(name: string): Promise<{ id: string; key: string }> {
  const r = await registerProfile({ name, via: "web" });
  if (!r.ok) throw new Error(r.message);
  return { id: r.id, key: r.key };
}

/** Owner bearer (API_SERVER_KEY) or a registered agent key. */
export async function authenticate(req: Request): Promise<Caller | null> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const token = m[1].trim();
  const owner = getEnv().API_SERVER_KEY;
  if (owner && owner.length >= 16) {
    const a = createHash("sha256").update(token).digest(), b = createHash("sha256").update(owner).digest();
    if (timingSafeEqual(a, b)) return { kind: "owner" };
  }
  if (!(token.startsWith("rk_") || token.startsWith("rkb_")) || !sql()) return null;
  try {
    await ensureSchema();
    const rows = (await sql()!`UPDATE agents SET last_used_at = now(), calls = calls + 1 WHERE (key_hash = ${hash(token)} OR token_hash = ${hash(token)}) AND NOT disabled RETURNING id, name, (token_hash = ${hash(token)}) AS via_token`) as { id: string; name: string; via_token: boolean }[];
    return rows[0] ? { kind: "agent", id: rows[0].id, name: rows[0].name, via: rows[0].via_token ? "token" : "key" } : null;
  } catch { return null; }
}
