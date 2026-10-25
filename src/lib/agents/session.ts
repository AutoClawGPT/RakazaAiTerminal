import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed agent-session cookie for the web UI. Separate cookie, separate payload role and separate key derivation from the owner session. */
export const AGENT_COOKIE = "rk_agent";
export const AGENT_SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (payload: string, secret: string) => createHmac("sha256", `agent-session:${secret}`).update(payload).digest();

/** `k` ties the cookie to the current key hash, so rotating or revoking a key ends every web session at once. */
export function signAgentSession(secret: string, agentId: string, keyTag: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ r: "agent", id: agentId, k: keyTag, exp: Math.floor(now / 1000) + AGENT_SESSION_MAX_AGE_S }));
  return `${payload}.${b64(mac(payload, secret))}`;
}

export function verifyAgentSession(token: string | undefined, secret: string | undefined, now = Date.now()): { id: string; keyTag: string } | null {
  if (!token || !secret || secret.length < 32) return null;
  const [payload, m] = token.split(".");
  if (!payload || !m) return null;
  const want = mac(payload, secret);
  let got: Buffer;
  try { got = Buffer.from(m, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { r?: string; id?: string; k?: string; exp?: number };
    if (p.r !== "agent" || typeof p.id !== "string" || typeof p.k !== "string" || typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    return { id: p.id, keyTag: p.k };
  } catch { return null; }
}
