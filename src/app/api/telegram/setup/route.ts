import { NextResponse } from "next/server";
import { tg } from "@/lib/telegram/api";
import { webhookSecret } from "../webhook/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only (the proxy requires the API_SERVER_KEY bearer). POST {"baseUrl":"https://your-domain"} sets the webhook; {"baseUrl":""} removes it. */
export async function POST(req: Request) {
  const { baseUrl } = (await req.json().catch(() => ({}))) as { baseUrl?: string };
  if (typeof baseUrl !== "string") return NextResponse.json({ error: "baseUrl_required" }, { status: 400 });
  if (baseUrl === "") return NextResponse.json(await tg("deleteWebhook", { drop_pending_updates: false }));
  if (!/^https:\/\/[^/\s]+$/.test(baseUrl)) return NextResponse.json({ error: "baseUrl must look like https://your-domain.vercel.app" }, { status: 400 });
  const r = await tg("setWebhook", { url: `${baseUrl}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  return NextResponse.json(r);
}
