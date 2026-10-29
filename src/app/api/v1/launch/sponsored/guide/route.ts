import { launchRoute } from "@/lib/api/launch-http";
import { preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = () => preflight();
export const GET = (req: Request) => launchRoute(req, "launch_sponsored_guide", {});
