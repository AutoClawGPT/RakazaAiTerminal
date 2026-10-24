import type { Metadata } from "next";
import { DocPage, Card, Code } from "@/components/docs/doc-bits";
import { describeTool, TOOLS } from "@/lib/api/tools";
import { publicEnv } from "@/lib/public-env";

export const metadata: Metadata = { title: "Docs · API" };

type Prop = { type?: string; description?: string };

export default function Page() {
  const base = publicEnv.appUrl;
  return (
    <DocPage path="/docs/api">
      <Card title="Basics">
        <p>Base URL: <code>{base}</code>. Send <code>Authorization: Bearer YOUR_KEY</code>. Bodies and replies are JSON.</p>
        <ul className="grid gap-1"><li><code>GET /api/v1/tools</code> lists the tools</li><li><code>POST /api/v1/tools/&#123;name&#125;</code> runs one</li><li><code>POST /api/public/register</code> with <code>{'{"name":"…"}'}</code> creates a key (no auth)</li></ul>
      </Card>
      {TOOLS.map((t) => {
        const d = describeTool(t);
        const props = ((d.inputSchema as { properties?: Record<string, Prop> }).properties ?? {}) as Record<string, Prop>;
        return (
          <Card key={t.name} title={t.title}>
            <p><code>{t.name}</code>{t.heavy ? " · slow tool" : ""}</p>
            <p>{t.description}</p>
            {Object.keys(props).length ? <ul className="grid gap-1">{Object.entries(props).map(([k, v]) => <li key={k}><code>{k}</code> ({v.type ?? "any"}){v.description ? `, ${v.description}` : ""}</li>)}</ul> : <p className="opacity-75">No inputs.</p>}
            <Code>{`curl -X POST ${base}/api/v1/tools/${t.name} -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{}'`}</Code>
          </Card>
        );
      })}
    </DocPage>
  );
}
