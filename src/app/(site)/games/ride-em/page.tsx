import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Ride 'Em" };

export default function Page() {
  return <StubPage path="/games/ride-em" />;
}
