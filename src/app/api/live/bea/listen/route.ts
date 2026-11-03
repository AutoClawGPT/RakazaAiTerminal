import { allow, clientIp } from "@/lib/rate";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** BEA's /listen relay accepts one listener, so this server reads it once and fans the mp3 out to every viewer tab on this instance. */
type Hub = { subs: Set<ReadableStreamDefaultController<Uint8Array>>; running: boolean };
const g = globalThis as unknown as { __beaListen?: Hub };
const hub: Hub = (g.__beaListen ??= { subs: new Set(), running: false });

async function pump() {
  if (hub.running) return;
  hub.running = true;
  try {
    const r = await beaFetch("/listen");
    if (!r.ok || !r.body) throw new Error(`bea ${r.status}`);
    const rd = r.body.getReader();
    while (hub.subs.size) {
      const { value, done } = await rd.read();
      if (done) break;
      for (const c of hub.subs) {
        try {
          c.enqueue(value);
        } catch {
          hub.subs.delete(c);
        }
      }
    }
    void rd.cancel().catch(() => {});
  } catch {
    for (const c of hub.subs) try { c.error(new Error("bea unavailable")); } catch {}
    hub.subs.clear();
  } finally {
    hub.running = false;
  }
}

/** Passthrough of BEA /listen (her live voice, mp3). Public (read-only), rate-limited per IP; token stays server-side. */
export async function GET(req: Request) {
  if (!(await allow("bea-listen", await clientIp(), 20, 1, "m"))) return new Response("slow down", { status: 429 });
  if (!beaConfig()) return new Response("BEA not configured", { status: 503 });
  let me: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      me = c;
      hub.subs.add(c);
      void pump();
    },
    cancel() {
      if (me) hub.subs.delete(me);
    },
  });
  req.signal.addEventListener("abort", () => me && hub.subs.delete(me));
  return new Response(body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
