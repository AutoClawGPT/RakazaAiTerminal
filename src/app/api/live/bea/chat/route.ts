import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/rate";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Live chat to BEA /chat. Public (read-only), rate-limited per IP; token stays server-side. */
export async function POST(req: Request) {
  if (!(await allow("chat", await clientIp(), 20, 1, "m"))) return NextResponse.json({ error: "slow_down", message: "Too many messages, give me a second." }, { status: 429 });
  if (!beaConfig()) return NextResponse.json({ error: "BEA not configured" }, { status: 503 });
  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  const text = String(message ?? "").trim().slice(0, 300);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  try {
    const r = await beaFetch("/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }), signal: AbortSignal.timeout(55000) });
    const j = (await r.json().catch(() => ({}))) as { response?: { content?: string; mood?: string } };
    if (!r.ok) return NextResponse.json({ error: `bea ${r.status}` }, { status: 502 });
    return NextResponse.json({ reply: j.response?.content ?? "", mood: j.response?.mood ?? "neutral" });
  } catch (e) {
    // BEA already has the message; when she is busy streaming she answers on air later, so a slow reply is not a failure
    if ((e as Error).name === "TimeoutError") return NextResponse.json({ reply: "", queued: true });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
