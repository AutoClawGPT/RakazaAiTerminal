import type { Metadata } from "next";
import { DocPage, Card, Code } from "@/components/docs/doc-bits";
import { TOOLS } from "@/lib/api/tools";
import { publicEnv } from "@/lib/public-env";

export const metadata: Metadata = { title: "Docs · MCP" };

export default function Page() {
  const base = publicEnv.appUrl;
  return (
    <DocPage path="/docs/mcp">
      <Card title="Connect">
        <p>The MCP server speaks Streamable HTTP at <code>{base}/mcp</code> and answers with JSON. Use your agent key as a bearer token.</p>
        <Code label="MCP client config">{`{
  "mcpServers": {
    "rakaza": {
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}`}</Code>
      </Card>
      <Card title="Tools">
        <ul className="grid gap-1">{TOOLS.map((t) => <li key={t.name}><code>{t.name}</code>, {t.description}</li>)}</ul>
        <p>Tools that touch launches return previews only. The owner approves any real launch in the dashboard.</p>
      </Card>
    </DocPage>
  );
}
