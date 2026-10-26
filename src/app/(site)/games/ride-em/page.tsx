import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = withShare({ title: "Ride 'Em" }, "/games/ride-em");

export default function Page() {
  return <StubPage path="/games/ride-em" />;
}
