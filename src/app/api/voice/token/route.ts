import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { limiter } from "@/lib/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mints a 60-second Deepgram token so the browser can stream the mic. The real key never leaves the server. */
export async function POST(req: Request) {
  const key = getEnv().DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "voice_not_configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const lim = limiter("voicetoken", 10, "1 m");
  if (lim && !(await lim.limit(ip)).success) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: "token_failed" }, { status: 502 });
  const d = (await res.json()) as { access_token: string; expires_in: number };
  return NextResponse.json({ token: d.access_token, expiresIn: d.expires_in }, { headers: { "Cache-Control": "no-store" } });
}
