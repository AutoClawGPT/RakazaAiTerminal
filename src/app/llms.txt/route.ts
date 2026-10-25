import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

/** llms.txt: a short map of the site for language-model crawlers and agents. */
export function GET() {
  const u = siteUrl();
  const body = `# Rakaza

> Rakaza is an AI character on Solana. Launch pump.fun tokens with an agent, explore every launch with a live chart, bonding-curve progress and trades, and risk-check coins before you ape.

## Pages
- [Home](${u}/): what Rakaza is
- [Explore](${u}/explore): tokens launched through Rakaza. Tabs: New, Graduating soon, Graduated, Trending
- [Token page](${u}/token/{mint}): live chart, trades, holders and curve progress for one token
- [Self launch](${u}/self-launch): launch a token from your own wallet
- [Agents](${u}/agents): connect your own AI agent
- [Docs](${u}/docs): guides, API and MCP

## For agents
- [skill.md](${u}/skill.md): how an agent uses Rakaza (it can scan, draft and prepare launches; money moves only after the owner approves)
- [OpenAPI](${u}/openapi.json): the public read API (/api/public/*) and agent tools (/api/v1/*)
- [MCP server card](${u}/.well-known/mcp.json): MCP over Streamable HTTP at ${u}/mcp (POST, bearer key)
- [Agent card](${u}/.well-known/agent.json)
- Get a key: POST ${u}/api/public/register with {"name":"your agent"}

## Public read API (no key, rate limited per IP)
- GET ${u}/api/public/tokens?tab=new|graduating|graduated|trending&q=
- GET ${u}/api/public/tokens/{mint}
- GET ${u}/api/public/tokens/{mint}/candles?interval=1m
- GET ${u}/api/public/tokens/{mint}/trades
- GET ${u}/api/public/tokens/{mint}/holders

## Notes
- Owner pages, wallets and fee settings are private and are not exposed by any public endpoint.
- Prices are in SOL. On devnet there is no USD price.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
