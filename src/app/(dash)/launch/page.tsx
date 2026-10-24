import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { LaunchClient } from "@/components/launch/launch-client";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import { isExecuteEnabled } from "@/lib/execute-gate";
export const metadata: Metadata = { title: "Launch" };
export const dynamic = "force-dynamic";

export default function Page() {
  const r = getRoute("/launch");
  const reason = isExecuteEnabled()
    ? "Execution is switched on, but the signing step is not built yet. It arrives with the devnet launch phase."
    : "Execution is off on this server, so nothing can be signed or sent.";
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <LaunchClient treasury={publicEnv.treasuryPubkey} network={publicEnv.network} executeBlockedReason={reason} />
      </section>
    </>
  );
}
