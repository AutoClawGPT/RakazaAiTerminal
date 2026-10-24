import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { getEnv } from "@/lib/env";

export type Caller = { kind: "owner" } | { kind: "agent"; id: string; name: string };

const hash = (k: string) => createHash("sha256").update(k).digest("hex");

export async function registerAgent(name: string): Promise<{ id: string; key: string }> {
  await ensureSchema();
  const q = sql()!;
  const id = "ag_" + randomBytes(6).toString("hex");
  const key = "rk_" + randomBytes(24).toString("base64url");
  await q`INSERT INTO agents (id, name, key_hash) VALUES (${id}, ${name}, ${hash(key)})`;
  return { id, key };
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
  if (!token.startsWith("rk_") || !sql()) return null;
  try {
    await ensureSchema();
    const rows = (await sql()!`UPDATE agents SET last_used_at = now(), calls = calls + 1 WHERE key_hash = ${hash(token)} AND NOT disabled RETURNING id, name`) as { id: string; name: string }[];
    return rows[0] ? { kind: "agent", id: rows[0].id, name: rows[0].name } : null;
  } catch { return null; }
}
