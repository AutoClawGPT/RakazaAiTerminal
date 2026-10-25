import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { ExploreView } from "@/components/launch/ledger-pages";
import { getRoute } from "@/lib/routes";
export const metadata: Metadata = { title: "Ledger" };
export const dynamic = "force-dynamic";

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default function Page() {
  const r = getRoute("/ledger");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="Every token launched through the platform, with fee status. Search, sort and filter, then open one for its page and checks." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        <ExploreView />
      </section>
    </>
  );
}
