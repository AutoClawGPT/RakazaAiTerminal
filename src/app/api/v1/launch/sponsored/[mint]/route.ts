import { launchRoute } from "@/lib/api/launch-http";
import { preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = () => preflight();
export async function GET(req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  return launchRoute(req, "launch_sponsored_status", { mint: mint === "list" ? undefined : mint });
}
