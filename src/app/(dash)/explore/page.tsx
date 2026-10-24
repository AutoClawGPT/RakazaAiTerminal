import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Explore" };

export default function Page() {
  return <StubPage path="/explore" variant="dash" />;
}
