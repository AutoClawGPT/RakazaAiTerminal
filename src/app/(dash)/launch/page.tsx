import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Launch" };

export default function Page() {
  return <StubPage path="/launch" variant="dash" />;
}
