import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { RevenueView } from "@/components/launch/ledger-pages";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
export const metadata: Metadata = { title: "Revenue" };
export const dynamic = "force-dynamic";

export default function Page() {
  const r = getRoute("/revenue");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="The platform's 30% share of creator fees: what has been sent to the treasury and what is waiting." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        <RevenueView treasury={publicEnv.treasuryPubkey} />
      </section>
    </>
  );
}
