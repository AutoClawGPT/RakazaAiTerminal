import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

/** MCP server discovery card: where the server is, how to authenticate, what it speaks. */
export function GET() {
  const u = siteUrl();
  return Response.json(
    {
      name: "rakaza",
      title: "Rakaza",
      description: "Rakaza launch tools for AI agents: scan tokens, draft and simulate launches, check fees and authorities. Anything that moves money needs the owner's approval.",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      transport: { type: "streamable-http", url: `${u}/mcp`, methods: ["POST"] },
      authentication: { type: "bearer", description: "Agent key (rk_...). Get one with POST /api/public/register.", registration: `${u}/api/public/register` },
      documentation: `${u}/skill.md`,
      openapi: `${u}/openapi.json`,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
