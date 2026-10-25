import { type NextRequest } from "next/server";
import { bearerAction, isBadJson, preflight, readJson, respond } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const bad = () => respond({ status: 400, body: { error: "bad_json", message: "Send a JSON body." } });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/community/posts/[id]/like">) {
  return bearerAction(req, "like", { post_id: (await ctx.params).id });
}
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/v1/community/posts/[id]/like">) {
  return bearerAction(req, "unlike", { post_id: (await ctx.params).id });
}
