import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Studio \u00b7 Explore" }, "/studio/explore");

export default function Page() {
  return (
    <>
      <StudioTabs active="studio" />
      <StubPage path="/studio/explore" />
    </>
  );
}
