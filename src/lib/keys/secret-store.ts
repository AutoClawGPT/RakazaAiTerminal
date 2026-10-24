import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { redis } from "../upstash";
import { getEnv } from "../env";

/**
 * Keys pasted in Settings are stored AES-256-GCM encrypted in Upstash.
 * Lookup order: environment variable first, then the encrypted store.
 * Values are never returned to the browser or logged.
 */
export const STORABLE = ["POLLINATIONS_API_KEY"] as const;
export type StorableName = (typeof STORABLE)[number];

const k = (name: string) => `rk:secret:${name}`;

function aesKey(): Buffer {
  const raw = getEnv().TREASURY_ENCRYPTION_KEY;
  if (!raw) throw new Error("TREASURY_ENCRYPTION_KEY is not set");
  return createHash("sha256").update(raw).digest();
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

function open(blob: string): string {
  const [iv, tag, enc] = blob.split(".");
  const d = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

export async function getSecret(name: StorableName): Promise<string | undefined> {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  const r = redis();
  if (!r) return undefined;
  try {
    const blob = await r.get<string>(k(name));
    return blob ? open(blob) : undefined;
  } catch {
    return undefined;
  }
}

export async function setSecret(name: StorableName, value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(STORABLE as readonly string[]).includes(name)) return { ok: false, error: "name not allowed" };
  const r = redis();
  if (!r) return { ok: false, error: "Upstash is not configured, so there is nowhere safe to store it" };
  try {
    await r.set(k(name), seal(value.trim()));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "store failed" };
  }
}

export async function secretSource(name: StorableName): Promise<"env" | "store" | "missing"> {
  if (process.env[name]?.trim()) return "env";
  const r = redis();
  if (!r) return "missing";
  try {
    return (await r.exists(k(name))) ? "store" : "missing";
  } catch {
    return "missing";
  }
}
