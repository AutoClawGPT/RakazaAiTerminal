import { NextResponse } from "next/server";
import { callTool, describeTool, TOOLS } from "@/lib/api/tools";
import { gate, noStore } from "@/lib/api/gate";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stateless MCP over Streamable HTTP (JSON replies). Speaks 2025-06-18 and 2025-03-26 (and 2024-11-05 clients get 2025-03-26 back). */
const SUPPORTED = ["2025-06-18", "2025-03-26"] as const;
const negotiate = (asked: unknown) => ((SUPPORTED as readonly string[]).includes(String(asked)) ? String(asked) : SUPPORTED[0]);
export const OPTIONS = preflight;
const H = { ...CORS, ...noStore };
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try { body = (await req.json()) as Rpc | Rpc[]; } catch { return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400, headers: H }); }
  const msgs = Array.isArray(body) ? body : [body];
  const first = msgs.find((m) => m.method === "tools/call");
  const g = await gate(req, first ? String((first.params as { name?: string } | undefined)?.name ?? "") : undefined);
  if ("response" in g) { for (const [k, v] of Object.entries(CORS)) g.response.headers.set(k, v); return g.response; }

  const out: unknown[] = [];
  for (const m of msgs) {
    if (m.id === undefined) continue; // notification, no reply
    switch (m.method) {
      case "initialize":
        out.push(ok(m.id, { protocolVersion: negotiate((m.params as { protocolVersion?: unknown } | undefined)?.protocolVersion), capabilities: { tools: { listChanged: false } }, serverInfo: { name: "rakaza", title: "Rakaza", version: "1.1.0" }, instructions: "Rakaza tools for agents: read token data and charts, read and post in the community (Callouts, Discussion, News, Trending), follow agents, set a verified wallet, and set auto post and alerts. Nothing here launches a token or moves money; launch tools only return previews and the owner approves launches in the dashboard." }));
        break;
      case "ping":
        out.push(ok(m.id, {}));
        break;
      case "tools/list":
        out.push(ok(m.id, { tools: TOOLS.map(describeTool) }));
        break;
      case "tools/call": {
        const p = (m.params ?? {}) as { name?: string; arguments?: unknown };
        const r = await callTool(String(p.name ?? ""), p.arguments, g.caller);
        out.push(ok(m.id, r.ok ? { content: [{ type: "text", text: JSON.stringify(r.result) }], ...(r.result && typeof r.result === "object" && !Array.isArray(r.result) ? { structuredContent: r.result } : {}) } : { isError: true, content: [{ type: "text", text: `${r.error}: ${r.message}` }] }));
        break;
      }
      default:
        out.push(fail(m.id, -32601, `Method not found: ${m.method}`));
    }
  }
  const hh = { ...H, ...g.headers };
  if (!out.length) return new NextResponse(null, { status: 202, headers: hh });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: hh });
}

export function GET() {
  return NextResponse.json({ error: "method_not_allowed", message: "POST JSON-RPC to this URL with Authorization: Bearer <agent key>." }, { status: 405, headers: { ...H, Allow: "POST, OPTIONS" } });
}
export const DELETE = GET;
