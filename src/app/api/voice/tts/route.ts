import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { limiter } from "@/lib/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rakaza's voice: a warm, smooth female Aura-2 voice (Luna). Override with RAKAZA_VOICE (e.g. aura-2-aurora-en). */
const FEMALE_VOICES = new Set(["luna", "aurora", "phoebe", "thalia", "amalthea", "iris", "asteria", "athena", "hera", "andromeda", "callista", "cora", "delia", "electra", "harmonia", "helena", "juno", "minerva", "ophelia", "pandora", "selene", "theia", "vesta", "celeste", "estrella"]);
function pickVoice() {
  const m = /^aura-2-([a-z]+)-en$/.exec(process.env.RAKAZA_VOICE ?? "");
  return m && FEMALE_VOICES.has(m[1]) ? `aura-2-${m[1]}-en` : "aura-2-luna-en";
}

/** Text in, MP3 out (Deepgram Aura-2). Capped at 600 characters. */
export async function POST(req: NextRequest) {
  const key = getEnv().DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "voice_not_configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const lim = limiter("tts", 30, "1 m");
  if (lim && !(await lim.limit(ip)).success) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const t = typeof text === "string" ? text.trim().slice(0, 600) : "";
  if (!t) return NextResponse.json({ error: "text_required" }, { status: 400 });
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${pickVoice()}&encoding=mp3`, {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ text: t }),
    cache: "no-store",
  });
  if (!res.ok || !res.body) return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  return new Response(res.body, { headers: { "content-type": "audio/mpeg", "Cache-Control": "no-store" } });
}
