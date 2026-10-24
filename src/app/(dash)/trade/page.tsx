import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Trade" };

export default function Page() {
  return <StubPage path="/trade" variant="dash" />;
}
