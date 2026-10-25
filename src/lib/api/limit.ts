import "server-only";
import { limiter } from "@/lib/upstash";
import { allow as memAllow } from "@/lib/auth/rate";

/**
 * Durable sliding-window limits (Upstash when configured, per-instance memory otherwise).
 * `failClosed` (used for registration and login) refuses the call if Upstash is configured but unreachable, instead of letting it through.
 */
export interface LimitResult { ok: boolean; limit: number; remaining: number; resetMs: number }
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000 } as const;

export async function rateLimit(scope: string, id: string, max: number, n: number, unit: "s" | "m" | "h", opts: { failClosed?: boolean } = {}): Promise<LimitResult> {
  const windowMs = n * UNIT_MS[unit];
  const lim = limiter(scope, max, `${n} ${unit}`);
  if (lim) {
    try {
      const r = await lim.limit(id);
      return { ok: r.success, limit: r.limit, remaining: Math.max(0, r.remaining), resetMs: Math.max(0, r.reset - Date.now()) };
    } catch {
      if (opts.failClosed) return { ok: false, limit: max, remaining: 0, resetMs: 30_000 };
    }
  }
  const ok = memAllow(`${scope}:${id}`, max, windowMs);
  return { ok, limit: max, remaining: ok ? max - 1 : 0, resetMs: windowMs };
}

export function limitHeaders(r: LimitResult): Record<string, string> {
  const h: Record<string, string> = { "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": String(r.remaining), "X-RateLimit-Reset": String(Math.ceil(r.resetMs / 1000)) };
  if (!r.ok) h["Retry-After"] = String(Math.max(1, Math.ceil(r.resetMs / 1000)));
  return h;
}

export function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
