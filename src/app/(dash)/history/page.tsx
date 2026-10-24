import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "History" };

export default function Page() {
  return <StubPage path="/history" variant="dash" />;
}
