import { allow, clientIp } from "@/lib/rate";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Passthrough of BEA /stage/stream (streamed). Public (read-only), rate-limited per IP; token stays server-side. */
export async function GET(req: Request) {
  if (!(await allow("bea-stream", await clientIp(), 20, 1, "m"))) return new Response("slow down", { status: 429 });
  if (!beaConfig()) return new Response("BEA not configured", { status: 503 });
  const r = await beaFetch("/stage/stream", { signal: req.signal }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("bea unavailable", { status: 502 });
  return new Response(r.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
