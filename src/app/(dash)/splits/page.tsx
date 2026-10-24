import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Fee splits" };

export default function Page() {
  return <StubPage path="/splits" variant="dash" />;
}
