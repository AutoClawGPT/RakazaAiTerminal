import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Trench Sim" };

export default function Page() {
  return <StubPage path="/games/trench-sim" />;
}
