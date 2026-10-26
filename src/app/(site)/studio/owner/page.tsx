import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Studio \u00b7 Owner tools" }, "/studio/owner");

export default function Page() {
  return <StubPage path="/studio/owner" />;
}
