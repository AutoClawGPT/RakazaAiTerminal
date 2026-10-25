import "server-only";
import { redis } from "@/lib/upstash";

/** Short-lived storage for a prepared launch awaiting the admin's tap. Redis when configured, else this process's memory. */
const mem = new Map<string, { v: string; exp: number }>();
const TTL = 600;

export async function putKey(key: string, value: unknown, ttl = TTL) {
  const s = JSON.stringify(value);
  const r = redis();
  if (r) { try { await r.set(`tg:${key}`, s, { ex: ttl }); return; } catch { /* fall back to memory */ } }
  mem.set(key, { v: s, exp: Date.now() + ttl * 1000 });
}

export async function getKey<T>(key: string): Promise<T | null> {
  const r = redis();
  if (r) { try { const v = await r.get<unknown>(`tg:${key}`); if (v != null) return (typeof v === "string" ? JSON.parse(v) : v) as T; } catch { /* check memory */ } }
  const m = mem.get(key);
  if (m && m.exp > Date.now()) return JSON.parse(m.v) as T;
  return null;
}

export async function delKey(key: string) {
  mem.delete(key);
  const r = redis();
  if (r) { try { await r.del(`tg:${key}`); } catch { /* ignore */ } }
}
