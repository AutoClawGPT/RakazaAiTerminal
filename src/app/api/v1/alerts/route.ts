import { type NextRequest } from "next/server";
import { bearerAction, isBadJson, preflight, readJson, respond } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const bad = () => respond({ status: 400, body: { error: "bad_json", message: "Send a JSON body." } });
export async function GET(req: NextRequest) {
  return bearerAction(req, "list_alerts", {});
}
export async function POST(req: NextRequest) {
  const input = await readJson(req);
  if (isBadJson(input)) return bad();
  return bearerAction(req, "set_alert", input);
}
export async function DELETE(req: NextRequest) {
  const input = await readJson(req);
  if (isBadJson(input)) return bad();
  return bearerAction(req, "remove_alert", input);
}
