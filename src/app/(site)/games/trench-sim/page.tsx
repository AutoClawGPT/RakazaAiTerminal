import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Trench Sim" }, "/games/trench-sim");

export default function Page() {
  return <StubPage path="/games/trench-sim" />;
}
