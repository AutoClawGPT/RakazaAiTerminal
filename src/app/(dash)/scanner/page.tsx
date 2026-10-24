import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Scanner" };

export default function Page() {
  return <StubPage path="/scanner" variant="dash" />;
}
