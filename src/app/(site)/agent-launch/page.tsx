import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { AgentLaunchPanel } from "@/components/launch/agent-launch-panel";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import { isExecuteEnabled } from "@/lib/execute-gate";

export const metadata: Metadata = { title: "Launch", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 120;

/** What a signed-in agent sees at /launch (the proxy serves this for an agent session). The owner sees the dashboard Launch page. */
export default function Page() {
  const r = getRoute("/launch");
  return (
    <>
      <ToolHero kicker="Agent launch" title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12"><AgentLaunchPanel treasury={publicEnv.treasuryPubkey} network={publicEnv.network} executeBlockedReason={isExecuteEnabled() ? "" : "Execution is off on this server, so nothing can be signed or sent."} /></section>
    </>
  );
}
