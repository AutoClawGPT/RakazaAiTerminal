import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import Link from "next/link";
import { ToolHero } from "@/components/tools/tool-frame";
import { SelfLaunchPage } from "@/components/launch/self-launch-page";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import { isSelfLaunchEnabled } from "@/lib/execute-gate";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = withShare({ title: "Self launch", description: "Launch a full pump.fun token from your own wallet. You pay, you own it." }, "/self-launch");
export const dynamic = "force-dynamic";
/** Server actions on this page run under this limit (Vercel function duration): pinning to IPFS can take a while. */
export const maxDuration = 60;

export default function Page() {
  const r = getRoute("/self-launch");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-4xl gap-5 py-8 md:py-12">
        <SelfLaunchPage network={publicEnv.network} treasury={publicEnv.treasuryPubkey} enabled={isSelfLaunchEnabled()} feeUsd={getEnv().SELF_LAUNCH_SERVICE_FEE_USD} />
        <p className="text-sm opacity-80">Looking for the owner&apos;s sponsored agent launcher? That is the separate <Link href="/launch" className="underline">Launch tab</Link>.</p>
      </section>
    </>
  );
}
