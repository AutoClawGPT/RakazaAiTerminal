import { NextResponse } from "next/server";
import { callTool, describeTool, TOOLS } from "@/lib/api/tools";
import { gate, noStore } from "@/lib/api/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stateless MCP over Streamable HTTP (JSON replies). Protocol 2025-03-26. */
const PROTOCOL = "2025-03-26";
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try { body = (await req.json()) as Rpc | Rpc[]; } catch { return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400, headers: noStore }); }
  const msgs = Array.isArray(body) ? body : [body];
  const first = msgs.find((m) => m.method === "tools/call");
  const g = await gate(req, first ? String((first.params as { name?: string } | undefined)?.name ?? "") : undefined);
  if ("response" in g) return g.response;

  const out: unknown[] = [];
  for (const m of msgs) {
    if (m.id === undefined) continue; // notification, no reply
    switch (m.method) {
      case "initialize":
        out.push(ok(m.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "rakaza", version: "1.0.0" }, instructions: "Rakaza launch tools. Money-moving steps are previews only and need the owner's approval in the dashboard." }));
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
        out.push(ok(m.id, r.ok ? { content: [{ type: "text", text: JSON.stringify(r.result) }] } : { isError: true, content: [{ type: "text", text: `${r.error}: ${r.message}` }] }));
        break;
      }
      default:
        out.push(fail(m.id, -32601, `Method not found: ${m.method}`));
    }
  }
  if (!out.length) return new NextResponse(null, { status: 202, headers: noStore });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: noStore });
}

export function GET() {
  return NextResponse.json({ error: "method_not_allowed", message: "POST JSON-RPC to this URL with Authorization: Bearer <agent key>." }, { status: 405, headers: { ...noStore, Allow: "POST" } });
}
export const DELETE = GET;
