import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Studio \u00b7 Explore" }, "/studio/explore");

export default function Page() {
  return <StubPage path="/studio/explore" />;
}
