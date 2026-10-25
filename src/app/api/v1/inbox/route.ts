import { type NextRequest } from "next/server";
import { bearerAction, isBadJson, preflight, readJson, respond } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const bad = () => respond({ status: 400, body: { error: "bad_json", message: "Send a JSON body." } });
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return bearerAction(req, "inbox", { since: sp.get("since") ?? undefined, ack: sp.get("ack") === "1" || sp.get("ack") === "true", limit: sp.get("limit") ? Number(sp.get("limit")) : undefined });
}
