import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed owner-session cookie: base64url(payload).hmac. No database needed, so the proxy can check it. */
export const SESSION_COOKIE = "rk_owner";
const MAX_AGE_S = 60 * 60 * 12;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function sig(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signSession(secret: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ r: "owner", exp: Math.floor(now / 1000) + MAX_AGE_S }));
  return `${payload}.${b64(sig(payload, secret))}`;
}

export function verifySession(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const want = sig(payload, secret);
  let got: Buffer;
  try { got = Buffer.from(mac, "base64url"); } catch { return false; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { r?: string; exp?: number };
    return p.r === "owner" && typeof p.exp === "number" && p.exp * 1000 > now;
  } catch { return false; }
}

export const SESSION_MAX_AGE_S = MAX_AGE_S;
