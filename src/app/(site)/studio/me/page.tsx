import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { MyStudio } from "@/components/studio/my-studio";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Studio \u00b7 My studio" };

export default function Page() {
  const r = getRoute("/studio/me");
  return (
    <>
      <StudioTabs active="me" />
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container max-w-3xl py-8 md:py-12"><MyStudio /></section>
    </>
  );
}
