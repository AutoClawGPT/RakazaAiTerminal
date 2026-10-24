import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Revenue" };

export default function Page() {
  return <StubPage path="/revenue" variant="dash" />;
}
