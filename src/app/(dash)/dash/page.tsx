import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <StubPage path="/dash" variant="dash" />;
}
