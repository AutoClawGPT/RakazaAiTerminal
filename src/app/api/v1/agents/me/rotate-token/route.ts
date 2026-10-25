import { type NextRequest } from "next/server";
import { bearerAction, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
/** New agent token (rkb_…). Needs the login key, not the token itself. */
export async function POST(req: NextRequest) {
  return bearerAction(req, "rotate_token", {}, { keyOnly: true });
}
