import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { RewardsView } from "@/components/launch/ledger-pages";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
export const metadata: Metadata = { title: "Rewards" };
export const dynamic = "force-dynamic";

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default function Page() {
  const r = getRoute("/rewards");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="Every fee share on every token: who gets what, what is waiting and what has been sent." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        <RewardsView treasury={publicEnv.treasuryPubkey} />
      </section>
    </>
  );
}
