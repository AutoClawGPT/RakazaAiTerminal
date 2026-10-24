import type { Metadata } from "next";
import { TalkClient } from "@/components/talk/talk-client";

export const metadata: Metadata = { title: "Talk to Rakaza" };

export default function Page() {
  return <TalkClient />;
}
