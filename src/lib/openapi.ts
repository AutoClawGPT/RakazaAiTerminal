import { siteUrl } from "@/lib/site";

const mint = { name: "mint", in: "path", required: true, description: "Token mint address (base58).", schema: { type: "string", minLength: 32, maxLength: 44 } } as const;
const net = { name: "network", in: "query", description: "devnet or mainnet-beta. Defaults to this deployment's network.", schema: { type: "string", enum: ["devnet", "mainnet-beta"] } } as const;
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: unknown, description = "OK") => ({ description, content: { "application/json": { schema } } });
const err = { 400: json(ref("Error"), "Bad request"), 404: json(ref("Error"), "Not found"), 429: json(ref("Error"), "Rate limited. Retry after the Retry-After header.") };

/** OpenAPI 3.1 description of the public read API, agent onboarding and the key-protected tool API. */
export function openApiDoc() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Rakaza API",
      version: "1.0.0",
      summary: "Public read API for tokens launched through Rakaza, plus the key-protected agent tools.",
      description: "The /api/public/* endpoints need no key and are rate limited per IP. Agent tools (/api/v1/*, /mcp) need a bearer key from POST /api/public/register. Owner routes are not part of this API.",
    },
    servers: [{ url: siteUrl() }],
    tags: [{ name: "Public" }, { name: "Agents" }],
    paths: {
      "/api/public/tokens": {
        get: {
          tags: ["Public"], operationId: "listTokens", summary: "List tokens launched through Rakaza",
          parameters: [
            { name: "tab", in: "query", schema: { type: "string", enum: ["new", "graduating", "graduated", "trending"], default: "new" }, description: "new = newest first. graduating = bonding curve at 60% or more, not yet graduated. graduated = curve complete. trending = most trades and volume in 24h." },
            { name: "q", in: "query", schema: { type: "string", maxLength: 64 }, description: "Search by name, ticker or mint." },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 24 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
            net,
          ],
          responses: { 200: json(ref("TokenList")), ...err },
        },
      },
      "/api/public/tokens/{mint}": { get: { tags: ["Public"], operationId: "getToken", summary: "One token: metadata, curve progress and market stats", parameters: [mint], responses: { 200: json(ref("TokenDetail")), ...err } } },
      "/api/public/tokens/{mint}/candles": {
        get: {
          tags: ["Public"], operationId: "getCandles", summary: "OHLCV candles (price in SOL)",
          parameters: [mint, { name: "interval", in: "query", schema: { type: "string", enum: ["15s", "1m", "5m", "15m", "1h", "4h", "1d"], default: "1m" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 200 } }],
          responses: { 200: json(ref("Candles")), ...err },
        },
      },
      "/api/public/tokens/{mint}/trades": { get: { tags: ["Public"], operationId: "getTrades", summary: "Latest trades, newest first", parameters: [mint, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } }], responses: { 200: json(ref("Trades")), ...err } } },
      "/api/public/tokens/{mint}/holders": { get: { tags: ["Public"], operationId: "getHolders", summary: "Largest holders (addresses shortened)", parameters: [mint], responses: { 200: json(ref("Holders")), ...err } } },
      "/api/public/register": { post: { tags: ["Agents"], operationId: "registerAgent", summary: "Get an agent key (shown once)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 60 } } } } } }, responses: { 200: json({ type: "object", properties: { id: { type: "string" }, name: { type: "string" }, key: { type: "string", description: "Starts with rk_. Shown once." }, note: { type: "string" } } }), 429: err[429] } } },
      "/api/v1/tools": { get: { tags: ["Agents"], operationId: "listTools", summary: "List agent tools", security: [{ bearer: [] }], responses: { 200: json({ type: "object" }), 401: json(ref("Error"), "Missing or invalid key") } } },
      "/api/v1/tools/{tool}": { post: { tags: ["Agents"], operationId: "callTool", summary: "Run one agent tool", security: [{ bearer: [] }], parameters: [{ name: "tool", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { 200: json({ type: "object" }), 401: json(ref("Error"), "Missing or invalid key"), 404: err[404], 429: err[429] } } },
      "/mcp": { post: { tags: ["Agents"], operationId: "mcp", summary: "MCP over Streamable HTTP (JSON-RPC 2.0, protocol 2025-03-26)", security: [{ bearer: [] }], requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { 200: json({ type: "object" }), 401: json(ref("Error"), "Missing or invalid key"), 405: json(ref("Error"), "GET is not supported: POST JSON-RPC") } } },
      "/api/health": { get: { tags: ["Public"], operationId: "health", summary: "Liveness check", responses: { 200: json({ type: "object" }) } } },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Agent key (rk_...) from /api/public/register." } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } },
        Token: {
          type: "object",
          properties: {
            mint: { type: "string" }, name: { type: "string" }, symbol: { type: "string" }, description: { type: "string" }, image: { type: ["string", "null"] },
            network: { type: "string", enum: ["devnet", "mainnet-beta"] }, mode: { type: "string", enum: ["agent", "self"] }, launchedAt: { type: "string", format: "date-time" },
            links: { type: "object", properties: { website: { type: "string" }, twitter: { type: "string" }, telegram: { type: "string" }, explorer: { type: "string" }, pumpfun: { type: "string" }, page: { type: "string" } } },
            curve: { type: "object", properties: { progressPct: { type: "number", description: "0 to 100, from the on-chain bonding curve (real token reserves sold)." }, complete: { type: "boolean" }, graduatingSoon: { type: "boolean" } } },
            market: { type: "object", properties: { priceSol: { type: ["number", "null"] }, marketCapSol: { type: ["number", "null"] }, priceUsd: { type: ["number", "null"] }, marketCapUsd: { type: ["number", "null"] }, volume24hSol: { type: "number" }, trades24h: { type: "integer" }, lastTradeAt: { type: ["string", "null"], format: "date-time" } } },
          },
        },
        TokenList: { type: "object", properties: { ok: { type: "boolean" }, tab: { type: "string" }, network: { type: "string" }, count: { type: "integer" }, hasMore: { type: "boolean" }, tokens: { type: "array", items: ref("Token") }, updatedAt: { type: "string", format: "date-time" } } },
        TokenDetail: { type: "object", properties: { ok: { type: "boolean" }, token: ref("Token") } },
        Candles: { type: "object", properties: { ok: { type: "boolean" }, mint: { type: "string" }, interval: { type: "string" }, source: { type: "string" }, candles: { type: "array", items: { type: "object", properties: { t: { type: "integer", description: "Bucket start, unix seconds" }, o: { type: "number" }, h: { type: "number" }, l: { type: "number" }, c: { type: "number" }, v: { type: "number", description: "Volume in SOL" } } } } } },
        Trades: { type: "object", properties: { ok: { type: "boolean" }, mint: { type: "string" }, trades: { type: "array", items: { type: "object", properties: { signature: { type: "string" }, t: { type: "integer" }, side: { type: "string", enum: ["buy", "sell"] }, solAmount: { type: "number" }, tokenAmount: { type: "number" }, priceSol: { type: "number" }, trader: { type: "string" } } } } } },
        Holders: { type: "object", properties: { ok: { type: "boolean" }, mint: { type: "string" }, holders: { type: "array", items: { type: "object", properties: { address: { type: "string" }, amount: { type: "number" }, pct: { type: "number" }, isCurve: { type: "boolean" } } } } } },
      },
    },
  };
}
