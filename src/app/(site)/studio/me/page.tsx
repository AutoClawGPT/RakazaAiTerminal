import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Studio \u00b7 My studio" };

export default function Page() {
  return <StubPage path="/studio/me" />;
}
