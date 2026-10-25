import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { ExploreView } from "@/components/launch/ledger-pages";
import { getRoute } from "@/lib/routes";
export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

export default function Page() {
  const r = getRoute("/explore");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="Every token launched through the platform. Search, sort and filter, then open one to verify it." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        <ExploreView />
      </section>
    </>
  );
}
