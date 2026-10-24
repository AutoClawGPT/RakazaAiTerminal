import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Fees" };

export default function Page() {
  return <StubPage path="/fees" variant="dash" />;
}
