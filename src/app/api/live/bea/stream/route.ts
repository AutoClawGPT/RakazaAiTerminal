import { isOwnerRequest } from "@/lib/owner";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Passthrough of BEA /stage/stream (streamed). Owner only. */
export async function GET(req: Request) {
  if (!(await isOwnerRequest())) return new Response("owner only", { status: 401 });
  if (!beaConfig()) return new Response("BEA not configured", { status: 503 });
  const r = await beaFetch("/stage/stream", { signal: req.signal }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("bea unavailable", { status: 502 });
  return new Response(r.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
