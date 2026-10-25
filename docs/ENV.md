# Environment variables

Generated from `.env.example` and the code (`src/lib/env.ts`, `process.env` reads). Real values live only in `.env.local` (git-ignored) or the host's secret store. **Never commit values.**

Network: this build runs on **devnet** (`NEXT_PUBLIC_SOLANA_NETWORK=devnet`). Nothing is signed unless `EXECUTE_ENABLED` is exactly `true`.

| Variable | Kind | Default / example | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | `http://localhost:3200` | canonical URL (links, OG, cookies) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | public | `devnet` | devnet / mainnet-beta |
| `NEXT_PUBLIC_TREASURY_PUBKEY` | public | (unset) | treasury public key (30% fee share, shown on Vault + Contract) |
| `TREASURY_PUBKEY` | config | (unset) | same value, server-side alias |
| `NEXT_PUBLIC_TOKEN_MINT` | public | (unset) | our coin's mint after launch (Home CA pill) |
| `NEXT_PUBLIC_JUPITER_PUBLISHABLE_KEY` | public | (unset) | browser-safe Jupiter plugin key (alias JUPITER_PUBLISHABLE_KEY) |
| `NEXT_PUBLIC_X_URL` | public | (unset) | optional: shows the X icon in the header |
| `NEXT_PUBLIC_TELEGRAM_URL` | public | (unset) | optional: shows the Telegram icon in the header |
| `EXECUTE_ENABLED` | config | (unset) |  |
| `SPONSORED_ENABLED` | config | `false` | sponsored launches (fee payer = treasury) off by default |
| `MAX_LAUNCH_SOL` | config | `0.5` | per-launch spend cap |
| `MAX_DAILY_SPEND_SOL` | config | `1` | daily spend cap |
| `DEV_PREVIEW_OWNER_PAGES` | config | `false` | dev only: view owner stub pages without a session. Ignored in production. |
| `SESSION_SECRET` | SECRET | (unset) | signs the owner session cookie |
| `CRON_SECRET` | SECRET | (unset) | authorises Vercel cron routes |
| `LIVE_SECRET` | SECRET | (unset) | signs live-queue tickets |
| `TREASURY_ENCRYPTION_KEY` | SECRET | (unset) | optional AES-GCM key if the treasury key is stored encrypted |
| `DASHBOARD_PASSWORD` | SECRET | (unset) | owner login at /login |
| `API_SERVER_KEY` | SECRET | (unset) | bearer key for agents on /mcp and /api/v1/* |
| `HELIUS_MAINNET` | config | (unset) | RPC (mainnet) via allow-listed /api/rpc proxy |
| `HELIUS_DEVNET` | config | (unset) | RPC (devnet) |
| `PIMLICO_API_KEY` | SECRET | (unset) | secondary RPC / sponsorship path |
| `JUPITER_API_KEY` | SECRET | (unset) | api.jup.ag tokens, price, swap |
| `SOLANATRACKER_API_KEY` | SECRET | (unset) | holders, bundlers, snipers |
| `PINATA_API_KEY` | SECRET | (unset) | IPFS pinning (metadata + memes) |
| `PINATA_API_SECRET` | SECRET | (unset) |  |
| `PINATA_JWT` | config | (unset) | optional alternative to key+secret |
| `UPSTASH_REST_URL` | config | (unset) | Redis REST (alias UPSTASH_REDIS_REST_URL) |
| `UPSTASH_REST_TOKEN` | SECRET | (unset) | read/write (alias UPSTASH_REDIS_REST_TOKEN) |
| `UPSTASH_READONLY_TOKEN` | SECRET | (unset) | read-only, for public GET routes |
| `DATABASE_URL` | SECRET | (unset) | optional Neon Postgres for ledgers |
| `RIVER_BASE_URL` | config | `https://api.river.ai/v1` | OpenAI-compatible |
| `RIVER_AGENT` | config | (unset) | operator agent key |
| `RIVER_RAKAZO` | config | (unset) | public persona key (separate quota) |
| `RIVER_MODEL_AGENT` | config | (unset) | chosen from /models |
| `RIVER_MODEL_PERSONA` | config | (unset) |  |
| `NEON_AI_GATEWAY_TOKEN` | SECRET | (unset) | fallback LLM gateway |
| `NEON_AI_GATEWAY_BASE_URL` | config | (unset) | needed for the fallback (not yet known) |
| `DEEPGRAM_API_KEY` | SECRET | (unset) | STT/TTS; only used server-side to mint short-lived tokens |
| `BRAVE_SEARCH_API_KEY` | SECRET | (unset) | agent web_search tool |
| `FIRECRAWL_API_KEY` | SECRET | (unset) | agent scrape_url tool |
| `UPCLOUD_API_TOKEN` | SECRET | (unset) | /infra read-only server status |
| `POLLINATIONS_API_KEY` | SECRET | (unset) |  |
| `POLLINATIONS_IMAGE_MODEL` | config | `flux` |  |
| `RAKAZA_VOICE` | config | `aura-2-luna-en` |  (commented out: optional) |
| `TELEGRAM_BOT_TOKEN` | SECRET | (unset) |  |
| `TELEGRAM_ADMIN_ID` | config | (unset) | your numeric Telegram user id |
| `UPSTASH_REDIS_REST_URL` | config | (unset) | Redis REST url (approvals, rate limits, Telegram pending taps) |
| `UPSTASH_REDIS_REST_TOKEN` | SECRET | (unset) | Redis read/write token |
| `TREASURY_PRIVATE_KEY` | SECRET | (unset) | SECRET. Treasury signer (base58 or JSON array). Only used behind EXECUTE_ENABLED and the approval ticket. Devnet key while testing. |
| `TELEGRAM_MOCK` | config | `1      record Telegram sends in memory instead of calling Telegram (tests/telegram-sim.ts)` |  (commented out: optional) |
| `BASE` | config | `http://localhost:3200   target for tests/*.mjs` |  (commented out: optional) |

## Switches that matter

- `EXECUTE_ENABLED=true` is the only thing that lets the server sign or send a transaction (launch, distribute, fee flow). Leave unset otherwise.
- `DEV_PREVIEW_OWNER_PAGES=true` only works with `NODE_ENV!=production` and loopback requests.
- `TELEGRAM_MOCK=1` is for tests only: Telegram sends are recorded in memory, nothing is sent.
- Caps: launch dev buy is limited to 0.5 SOL and daily spend to 1 SOL by the execute gate.

## Tests that use these

- `tests/tools-audit.mjs`, `tests/talk-e2e.mjs`, `tests/studio-e2e.mjs` run against `BASE` (default `http://localhost:3200`).
- `tests/telegram-sim.ts` needs `TELEGRAM_MOCK=1` and refuses to run without it.
- `tests/devnet-fee-flow.ts` is devnet only and needs `TREASURY_PRIVATE_KEY` plus `EXECUTE_ENABLED=true`.

## Audit notes (Vercel names checked against this file and `.env.example`, Oct 2026)

Names only, never values. Everything the code needs on Vercel is present. Names that are intentionally not set in production:

| Name | Why it is absent |
|---|---|
| `SELF_LAUNCH_ENABLED` | default is on for devnet and off for mainnet; set to `true` only for an explicit mainnet go-live |
| `DEV_PREVIEW_OWNER_PAGES` | local development only (never in production) |
| `TELEGRAM_MOCK` | tests only |
| `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`, `NEXT_PUBLIC_TOKEN_MINT` | optional site branding; the footer hides what is not set |
| `RIVER_MODEL_AGENT`, `RIVER_MODEL_PERSONA`, `POLLINATIONS_IMAGE_MODEL` | built-in defaults are used |
| `PINATA_JWT` | optional; the code uses `PINATA_API_KEY` and `PINATA_API_SECRET` |

Names that exist on Vercel but were missing from this file:

| Name | Kind | Meaning |
|---|---|---|
| `NEON_PROJECT_ID` | config | id of the Neon project (ops reference only, the app does not read it) |
| `SELF_LAUNCH_SERVICE_FEE_USD` | config | flat self-launch service fee in USD (default 2) |
| `SELF_LAUNCH_SERVICE_FEE_SOL` | config | fallback fee in SOL when the price lookup fails (default 0.015) |
| `UPSTASH_REST_URL`, `UPSTASH_REST_TOKEN` | config / SECRET | aliases of `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; the app accepts either spelling |
