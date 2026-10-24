import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Rewards" };

export default function Page() {
  return <StubPage path="/rewards" variant="dash" />;
}
