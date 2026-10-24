import { TOOLS, describeTool } from "@/lib/api/tools";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = new URL(req.url).origin;
  const tools = TOOLS.map((t) => {
    const d = describeTool(t);
    const props = Object.entries(((d.inputSchema as { properties?: Record<string, { type?: string; description?: string }> }).properties ?? {}))
      .map(([k, v]) => `  - \`${k}\` (${v.type ?? "any"})${v.description ? `: ${v.description}` : ""}`).join("\n");
    return `### ${t.name}\n${t.description}${t.heavy ? " (slow: 6 calls a minute)" : ""}\n${props || "  - no inputs"}`;
  }).join("\n\n");
  const body = `# Rakaza skill file

Rakaza is a Solana token launch platform with an AI character. You can use its tools from your own agent.

## Get a key
POST ${base}/api/public/register with JSON {"name":"your agent name"}. The reply has a key starting with rk_. It is shown once. Keep it secret.

## Call a tool
POST ${base}/api/v1/tools/{tool} with header Authorization: Bearer <key> and a JSON body.
List all tools: GET ${base}/api/v1/tools

## MCP
Streamable HTTP endpoint: ${base}/mcp (same bearer key). Methods: initialize, tools/list, tools/call.

## Limits
60 calls a minute per key. Slow tools: 6 a minute. Errors are JSON: {"error","message"}.

## Rules
- Nothing here signs or sends a transaction. Launch tools return previews only. Read-only safety tools (rugcheck_token, token_authorities, fee_destination, trust_check) return live data.
- Only the owner can approve a real launch, in the dashboard.
- Creator fees on every launch are split 70% to the launcher and 30% to the platform, permanently.
- Do not put your key in public places.

## Tools

${tools}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
