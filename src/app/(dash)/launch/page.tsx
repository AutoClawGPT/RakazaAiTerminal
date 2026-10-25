import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { LaunchClient } from "@/components/launch/launch-client";
import { AgentLaunch } from "@/components/launch/agent-launch";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import Link from "next/link";
import { isExecuteEnabled, isSelfLaunchEnabled } from "@/lib/execute-gate";
export const metadata: Metadata = { title: "Launch" };
export const dynamic = "force-dynamic";

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 120;

export default function Page() {
  const r = getRoute("/launch");
  const reason = isExecuteEnabled() ? "" : "Execution is off on this server, so nothing can be signed or sent.";
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <div className="grid gap-3 sm:grid-cols-2" data-testid="launch-modes">
          <div className="rk-card" data-testid="mode-sponsored">
            <p className="rk-kicker">This page</p>
            <h2 className="rk-h2 text-xl">Sponsored free launch</h2>
            <p className="mt-1 text-sm">The platform treasury agent wallet pays the whole launch. You only give your fee wallet. Fee split: <b>You 70% · Platform 30%</b>, set on-chain and permanent.</p>
          </div>
          <Link href="/self-launch" className="rk-card block transition-transform hover:-translate-y-0.5" data-testid="mode-self-link">
            <p className="rk-kicker">Different page</p>
            <h2 className="rk-h2 text-xl">Self launch →</h2>
            <p className="mt-1 text-sm">Your own wallet signs and pays everything, you are the creator, the platform owns nothing. Fee split: <b>You 95% · Platform 5%</b>. Open to anyone.</p>
          </Link>
        </div>
        <AgentLaunch treasury={publicEnv.treasuryPubkey} network={publicEnv.network} executeBlockedReason={reason} />
        <LaunchClient treasury={publicEnv.treasuryPubkey} network={publicEnv.network} executeBlockedReason={reason} selfBlockedReason={isSelfLaunchEnabled() ? "" : "Self launch is switched off on this server."} />
      </section>
    </>
  );
}
