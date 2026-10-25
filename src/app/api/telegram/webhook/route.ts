import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { handleUpdate, type Update } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Telegram sends this secret in a header on every webhook call. It is derived from the bot token, so nothing extra to configure. */
export function webhookSecret(): string {
  return createHmac("sha256", "rakaza-telegram-webhook").update(process.env.TELEGRAM_BOT_TOKEN ?? "").digest("hex").slice(0, 48);
}

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: false }, { status: 503 });
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const want = webhookSecret();
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return NextResponse.json({ ok: false }, { status: 401 });
  let u: Update;
  try { u = (await req.json()) as Update; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (typeof u?.update_id !== "number") return NextResponse.json({ ok: false }, { status: 400 });
  after(async () => { await handleUpdate(u); });
  return NextResponse.json({ ok: true });
}
