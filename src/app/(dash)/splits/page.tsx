import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { SplitsTool } from "@/components/tools/splits-tool";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
export const metadata: Metadata = { title: "Fee splits" };

export default function Page() {
  const r = getRoute("/splits");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <SplitsTool treasury={publicEnv.treasuryPubkey} />
      </section>
    </>
  );
}
