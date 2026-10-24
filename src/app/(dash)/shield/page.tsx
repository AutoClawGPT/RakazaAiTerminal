import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { ShieldTool } from "@/components/tools/shield-tool";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Shield" };

export default function Page() {
  const r = getRoute("/shield");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <ShieldTool />
      </section>
    </>
  );
}
