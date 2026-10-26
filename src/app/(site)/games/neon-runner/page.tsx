import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Neon Runner" }, "/games/neon-runner");

export default function Page() {
  return <StubPage path="/games/neon-runner" />;
}
