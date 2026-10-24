import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Keeps the new mint's secret key out of the browser between "prepare" and "launch". AES-256-GCM, key derived from SESSION_SECRET. */
const key = (secret: string) => createHash("sha256").update(`mint-seal:${secret}`).digest();

export function sealBytes(bytes: Uint8Array, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function openBytes(sealed: string, secret: string): Uint8Array {
  const b = Buffer.from(sealed, "base64url");
  if (b.length < 29) throw new Error("Sealed value is malformed.");
  const d = createDecipheriv("aes-256-gcm", key(secret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(28)), d.final()]));
}
