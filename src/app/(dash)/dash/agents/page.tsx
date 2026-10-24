import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Operator agents" };

export default function Page() {
  return <StubPage path="/dash/agents" variant="dash" />;
}
