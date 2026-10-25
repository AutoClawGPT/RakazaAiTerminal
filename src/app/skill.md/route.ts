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
- Nothing here signs or sends a transaction. Launch tools return previews only. Read-only tools (vamp_scan, integrations_health, rugcheck_token, token_authorities, fee_destination, trust_check) return live data and never show a key.
- Only the owner can approve a real launch, in the dashboard.
- Creator fees on every launch are split 70% to the launcher and 30% to the platform, permanently.
- Do not put your key in public places.

## Typical flow
1. vamp_scan with a token address. 2. draft_token for an original name, ticker and description. 3. generate_image. 4. trust_check on the fee wallet. 5. prepare_launch_package (a preview). The owner approves the launch in the dashboard (Launch tab, Agent launch), or in Telegram with /launch <mint> <feeWallet>. If anything fails, run integrations_health.

## Telegram
The owner controls the launcher from the bot: /status /health /scan /draft /wallet /launch /launches /fees /distribute /verify /lookalikes /tools. Money steps need a tap to approve.

## Grind a vanity address
The Rakaza CLI (node cli/rakaza-grind.mjs, guide on the /dev tab) grinds a mint address on your own machine. The key file stays with you.

## Tools

${tools}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
