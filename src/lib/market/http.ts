import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { limiter } from "@/lib/upstash";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining" } as const;

const mem = new Map<string, number[]>();
function memHit(key: string, max: number, windowMs: number): { ok: boolean; remaining: number; retry: number } {
  const now = Date.now();
  const hits = (mem.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  mem.set(key, hits);
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some((t) => now - t < windowMs)) mem.delete(k);
  return { ok: hits.length <= max, remaining: Math.max(0, max - hits.length), retry: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Per-IP limit for a public read endpoint (Upstash when set, otherwise per-instance memory). A Response means: stop, send it. */
export async function guard(req: NextRequest, scope: string, perMinute: number): Promise<{ limited: Response | null; headers: Record<string, string> }> {
  const ip = clientIp(req);
  let ok = true, remaining = perMinute, retry = 60;
  try {
    const lim = limiter(`pub:${scope}`, perMinute, "1 m");
    if (lim) {
      const r = await lim.limit(ip);
      ok = r.success; remaining = r.remaining; retry = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
    } else {
      const r = memHit(`${scope}:${ip}`, perMinute, 60_000);
      ok = r.ok; remaining = r.remaining; retry = r.retry;
    }
  } catch {
    const r = memHit(`${scope}:${ip}`, perMinute, 60_000);
    ok = r.ok; remaining = r.remaining; retry = r.retry;
  }
  const headers = { "X-RateLimit-Limit": String(perMinute), "X-RateLimit-Remaining": String(remaining) };
  if (!ok) return { limited: NextResponse.json({ ok: false, error: "rate_limited", message: `Slow down. Try again in ${retry}s.` }, { status: 429, headers: { ...CORS, ...headers, "Retry-After": String(retry), "Cache-Control": "no-store" } }), headers };
  return { limited: null, headers };
}

/** JSON with CORS and a short shared cache (the CDN absorbs bursts; clients still see fresh data within seconds). */
export function ok(body: unknown, headers: Record<string, string>, maxAge = 5, status = 200) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...headers, "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` : "no-store" } });
}
export function fail(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}
export function preflight() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" } });
}
