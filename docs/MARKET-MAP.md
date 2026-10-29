# Market layer map (path -> responsibility)

Read-only audit, Piece 3a. Paths are under `src/`.

## Market helpers (`lib/market/`)
- `tokens.ts` - list/get/peek a token, candle source choice, trades list, stale-stat refresh, `PublicToken` builder.
- `candles.ts` - builds OHLCV candles from the indexed trades (`curve_trades`).
- `indexer.ts` - decodes pump TradeEvents for the curve PDA into `curve_trades`; `refreshStats` writes `mint_stats`.
- `curve.ts` - RPC connection per network, curve PDA, curve progress / price.
- `holders.ts` - top token holders (30 s cache).
- `mainnet.ts` - mainnet-only DexScreener market + GeckoTerminal candles.
- `http.ts` - public API helpers: rate limit, CORS, cache headers, error shape.
- `types.ts` - public types, candle intervals.
- `usd.ts`, `pool.ts` - added in Piece 3b (shared USD helper, PumpSwap pool price).

## Public API (`app/api/public/tokens/`)
- `route.ts` list + search + tabs; `[mint]/route.ts` one token; `[mint]/candles`, `[mint]/trades`, `[mint]/holders`.
- `app/api/cron/index-trades/route.ts` daily catch-up of the trade index and stats (also lazy per request).

## Pages and UI
- `app/(site)/explore/page.tsx` + `components/market/explore-client.tsx` - Explore tabs, search, polling.
- `components/market/token-card.tsx` - one Explore card.
- `app/(site)/token/[mint]/page.tsx` - token page shell (SSR, metadata, community thread).
- `components/market/token-live.tsx` - polling wrapper: stats, trades, holders, curve bar.
- `components/market/price-chart.tsx` - lightweight-charts candles + volume.
- `components/market/{grad-bar,format,share-button,owner-checks}.tsx` - curve bar, number formatting, share, owner-only checks.

## Callouts (community)
- `lib/community/service.ts` - posts, feed, auto launch callouts. `lib/community/calls.ts` - real wallet buys -> callout posts.
- `components/community/{post-card,thread-live,composer,community-client}.tsx` - callout UI.
- `lib/api/community-tools.ts`, `app/mcp/route.ts`, `lib/openapi.ts`, `app/skill.md/route.ts` - agent/MCP surface and docs.

## Environment names the code reads (names only)
Network/RPC: `NEXT_PUBLIC_SOLANA_NETWORK`, `HELIUS_DEVNET`, `HELIUS_MAINNET` (RPC is built from these; there is no `SOLANA_RPC_URL`, `SOLANA_CLUSTER` or `HELIUS_API_KEY` read anywhere).
Others: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TOKEN_MINT`, `NEXT_PUBLIC_TREASURY_PUBKEY`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`, `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `API_SERVER_KEY`, `PINATA_*`, `TREASURY_*`, `UPSTASH_*`, telegram/voice/AI keys.

## Localhost audit
Hard-coded `localhost:3200` only appears as the last-resort default of the app URL (`lib/env.ts`, `lib/public-env.ts`, `lib/site.ts`, `app/layout.tsx`), plus loopback checks in `proxy.ts`, an SSRF block in `games/ride-em/byo.ts` and a user-side check in `public/games/ride-em/rakaza-brain.js`. None is a runtime call to localhost. `public-env.ts` now also falls back to `VERCEL_PROJECT_PRODUCTION_URL` on the server before using localhost.
