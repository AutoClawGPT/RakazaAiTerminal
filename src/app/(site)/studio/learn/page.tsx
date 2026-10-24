import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Studio \u00b7 How it works" };

export default function Page() {
  return <StubPage path="/studio/learn" />;
}
