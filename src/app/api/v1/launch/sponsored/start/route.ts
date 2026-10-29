import { launchRoute } from "@/lib/api/launch-http";
import { preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The launch itself runs after the response (after()), so keep the function alive for it.
export const maxDuration = 120;
export const OPTIONS = () => preflight();
export const POST = (req: Request) => launchRoute(req, "launch_sponsored_start");
