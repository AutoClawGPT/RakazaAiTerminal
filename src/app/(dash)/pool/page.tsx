import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { PoolTool } from "@/components/tools/pool-tool";
import { getRoute } from "@/lib/routes";
export const metadata: Metadata = { title: "Grind pool" };

export default function Page() {
  const r = getRoute("/pool");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <PoolTool />
      </section>
    </>
  );
}
