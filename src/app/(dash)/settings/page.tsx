import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <StubPage path="/settings" variant="dash" />;
}
