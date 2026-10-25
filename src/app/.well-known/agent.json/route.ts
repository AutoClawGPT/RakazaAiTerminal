import { siteUrl, SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";

/** Agent card (A2A-style discovery): who we are and the interfaces an agent can use. */
export function GET() {
  const u = siteUrl();
  return Response.json(
    {
      name: "Rakaza",
      description: SITE_DESCRIPTION,
      url: u,
      version: "1.0.0",
      provider: { organization: "Rakaza", url: u },
      documentationUrl: `${u}/skill.md`,
      capabilities: { streaming: false, pushNotifications: false },
      authentication: { schemes: ["bearer"], registration: `${u}/api/public/register` },
      interfaces: [
        { type: "mcp", url: `${u}/mcp`, transport: "streamable-http" },
        { type: "http", url: `${u}/api/v1/tools`, spec: `${u}/openapi.json` },
        { type: "http-public", url: `${u}/api/public/tokens`, spec: `${u}/openapi.json` },
      ],
      skills: [
        { id: "scan-token", name: "Scan a token", description: "Risk-check a Solana token." },
        { id: "prepare-launch", name: "Prepare a launch package", description: "Draft and simulate a pump.fun launch. Execution needs the owner's approval." },
        { id: "explore", name: "Explore launches", description: "Read tokens launched through Rakaza: new, graduating, graduated, trending." },
      ],
    },
    { headers: { "Cache-Control": "public, s-maxage=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
