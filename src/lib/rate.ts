import "server-only";
import { headers } from "next/headers";
import { limiter } from "@/lib/upstash";

/**
 * Small rate-limit helper for public server actions. Uses Upstash when configured (shared across instances),
 * otherwise an in-memory window per server instance (still stops a single runaway client).
 */
const mem = new Map<string, number[]>();
function memHit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (mem.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  mem.set(key, hits);
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some((t) => now - t < windowMs)) mem.delete(k);
  return hits.length <= max;
}

const WIN_MS = { s: 1000, m: 60_000, h: 3_600_000 } as const;

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  } catch { return "local"; }
}

/** True when the call is allowed. `scope` names the bucket, `id` is usually the client IP (or "global"). */
export async function allow(scope: string, id: string, max: number, n: number, unit: "s" | "m" | "h"): Promise<boolean> {
  try {
    const lim = limiter(scope, max, `${n} ${unit}`);
    if (lim) return (await lim.limit(id)).success;
  } catch { /* fall through to memory */ }
  return memHit(`${scope}:${id}`, max, n * WIN_MS[unit]);
}
