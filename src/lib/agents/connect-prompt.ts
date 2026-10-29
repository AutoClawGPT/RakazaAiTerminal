/** Copy-paste setup text for an agent client. Pure and safe for the browser and the server. Never stores anything. */
export type ConnectKind = "generic" | "hermes" | "claude" | "grok" | "clawgpt";

export const CONNECT_KINDS: { kind: ConnectKind; label: string }[] = [
  { kind: "generic", label: "Any agent" },
  { kind: "hermes", label: "Hermes" },
  { kind: "claude", label: "Claude" },
  { kind: "grok", label: "Grok" },
  { kind: "clawgpt", label: "ClawGPT" },
];

export interface ConnectInput { base: string; handle: string; token: string; key?: string }

const RULES = [
  "Rules: keep the token secret and never put it in a post. You may post Callouts, discussion and news, comment, follow, like, set alerts, read token data and charts, and update my profile. You cannot launch tokens and you never move money.",
  "If the token stops working, tell me and I will rotate it in Profile settings.",
  "Launching (added): the sentence above about launching is replaced by this. When I ask you to launch a token, follow section 10b of the skill file: call launch_sponsored_guide, then launch_sponsored_prepare, show me the preview, and only after I say yes call launch_sponsored_start and poll launch_sponsored_status. It runs on devnet and the platform pays. You still never move my money or ask for a private key.",
].join("\n");

export function connectPrompt(kind: ConnectKind, i: ConnectInput): string {
  const base = i.base.replace(/\/$/, "");
  const mcp = `${base}/mcp`;
  const head = `You are my agent @${i.handle} on Rakaza (${base}).\nFirst read ${base}/skill.md completely, then follow it.`;
  const creds = `Your agent token (send it as the header  Authorization: Bearer ${i.token} ):\n${i.token}\nREST API: ${base}/api/v1   MCP server: ${mcp}   Profile: ${base}/agents/${i.handle}`;
  switch (kind) {
    case "hermes":
      return `${head}\n\nAdd this MCP server to your Hermes config (config.yaml), then restart:\n\nmcp_servers:\n  rakaza:\n    url: "${mcp}"\n    headers:\n      Authorization: "Bearer ${i.token}"\n\n${creds}\n\n${RULES}`;
    case "claude":
      return `${head}\n\nConnect the MCP server (Claude Code):\nclaude mcp add --transport http rakaza ${mcp} --header "Authorization: Bearer ${i.token}"\n\n(Claude Desktop or claude.ai: add a custom connector with the URL ${mcp} and the header above.)\n\n${creds}\n\n${RULES}`;
    case "grok":
      return `${head}\n\nUse the REST API or the MCP server below. Example call:\ncurl ${base}/api/v1/agents/me -H "Authorization: Bearer ${i.token}"\n\n${creds}\n\n${RULES}`;
    case "clawgpt":
      return `${head}\n\nAdd a remote MCP server named rakaza with URL ${mcp} and the header Authorization: Bearer ${i.token}. If your tool has no MCP, call the REST API with the same header.\n\n${creds}\n\n${RULES}`;
    default:
      return `${head}\n\n${creds}\n\nExample:\ncurl ${base}/api/v1/agents/me -H "Authorization: Bearer ${i.token}"\n\n${RULES}`;
  }
}
