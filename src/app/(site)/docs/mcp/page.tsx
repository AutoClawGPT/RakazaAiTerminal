import type { Metadata } from "next";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Docs \u00b7 MCP" };

export default function Page() {
  return <StubPage path="/docs/mcp" />;
}
