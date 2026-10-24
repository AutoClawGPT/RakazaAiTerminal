import { NextResponse, type NextRequest } from "next/server";
import { riverChat, type ChatMsg } from "@/lib/brain/river";
import { PERSONA, parseCommand } from "@/lib/brain/persona";
import { limiter } from "@/lib/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mem = new Map<string, number[]>();
function memLimit(id: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (mem.get(id) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  mem.set(id, hits);
  return hits.length <= max;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const lim = limiter("chat", 20, "1 m");
  const allowed = lim ? (await lim.limit(ip)).success : memLimit(ip, 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "slow_down", message: "Too many messages, give me a second." }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return NextResponse.json({ error: "messages_required" }, { status: 400 });
  const history: ChatMsg[] = raw
    .slice(-12)
    .filter((m): m is { role: "user" | "assistant"; content: string } => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return NextResponse.json({ error: "last_message_must_be_user" }, { status: 400 });

  const command = parseCommand(last.content);
  const out = await riverChat([{ role: "system", content: PERSONA }, ...history], { maxTokens: command === "sing" || command === "story" ? 220 : 140 });
  if (!out.ok) return NextResponse.json({ error: "brain_unavailable", message: "My brain didn't answer. Try again in a moment." }, { status: 502 });
  return NextResponse.json({ reply: out.text, command }, { headers: { "Cache-Control": "no-store" } });
}
