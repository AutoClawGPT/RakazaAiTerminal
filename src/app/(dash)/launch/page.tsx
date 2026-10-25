import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { AgentLaunch } from "@/components/launch/agent-launch";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import Link from "next/link";
import { isExecuteEnabled } from "@/lib/execute-gate";
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
        <p className="text-sm" data-testid="launch-scope">
          This page is the <b>sponsored agent launcher</b>: the platform treasury agent wallet pays the whole launch, you only give your fee wallet and get 70% of the creator fees.
          {" "}<Link href="/self-launch" className="underline" data-testid="mode-self-link">Launching from your own wallet is a separate page, the Self-launch tab.</Link>
        </p>
        <AgentLaunch treasury={publicEnv.treasuryPubkey} network={publicEnv.network} executeBlockedReason={reason} />
      </section>
    </>
  );
}
