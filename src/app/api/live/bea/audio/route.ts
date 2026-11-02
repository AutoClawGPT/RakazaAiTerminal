import { isOwnerRequest } from "@/lib/owner";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Push-to-talk WAV passthrough to BEA /audio. Owner only. */
export async function POST(req: Request) {
  if (!(await isOwnerRequest())) return new Response("owner only", { status: 401 });
  if (!beaConfig()) return new Response("BEA not configured", { status: 503 });
  const r = await beaFetch("/audio", { method: "POST", headers: { "content-type": req.headers.get("content-type") ?? "audio/wav" }, body: await req.arrayBuffer() }).catch(() => null);
  if (!r) return new Response("bea unavailable", { status: 502 });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
}
