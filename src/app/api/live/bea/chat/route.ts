import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/owner";
import { beaConfig, beaFetch } from "@/lib/live/bea";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Live chat to BEA /chat. Owner only. */
export async function POST(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "owner only" }, { status: 401 });
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
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
