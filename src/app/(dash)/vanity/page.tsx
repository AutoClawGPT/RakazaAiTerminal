import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { VanityTool } from "@/components/tools/vanity-tool";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Vanity lab" };

export default function Page() {
  const r = getRoute("/vanity");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <VanityTool />
      </section>
    </>
  );
}
