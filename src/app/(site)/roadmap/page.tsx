import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Roadmap" };

export default function Page() {
  return <StubPage path="/roadmap" />;
}
