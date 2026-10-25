# RakazaTokenization

Rakaza is a Solana token launch platform with an AI character. It is a Next.js app (App Router) with a public site, an owner dashboard, a launch flow built on pump.fun, a 70/30 fee split, an agent API (REST and MCP), and a Telegram control bot.

**Status: devnet.** Nothing is signed or sent unless `EXECUTE_ENABLED` is exactly `true`. Mainnet is a separate, deliberate switch (see [docs/DEPLOY.md](docs/DEPLOY.md)).

## Stack

Next.js 16 (App Router, Turbopack, `src/proxy.ts`), React 19, TypeScript, Tailwind, zod 4, `@solana/web3.js` 1.99, `@pump-fun/pump-sdk`, Neon Postgres (HTTP), Upstash Redis, Three.js / three-vrm for the character stage. Node 22.x.

## Setup

```bash
nvm use 22            # or any Node 22.x
npm ci
cp .env.example .env.local
# fill in .env.local (see below). Real values never go in git.
npm run dev           # http://localhost:3200
```

Minimum to boot: `SESSION_SECRET`, `CRON_SECRET`, `LIVE_SECRET` (each at least 32 random characters). Generate one with `openssl rand -hex 32`. To sign in as owner also set `DASHBOARD_PASSWORD` and `API_SERVER_KEY` (at least 16 characters). Everything else is optional and the matching feature shows "not configured" until you add it.

Full variable list with notes: [docs/ENV.md](docs/ENV.md). Names only: [.env.example](.env.example).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server on port 3200 |
| `npm run build` | production build |
| `npm start` | serve the production build on port 3200 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (0 errors expected) |
| `npm run check` | typecheck, lint and build |
| `npm run grind` | local vanity-address grinder CLI (`cli/rakaza-grind.mjs`) |

Tests live in `tests/`. The `*.mjs` ones are plain Node scripts against a running server (`BASE=http://localhost:3200 node tests/tools-audit.mjs`). The `*-live.ts` ones talk to devnet. Run only the ones you understand; none of them touches mainnet.

## Security model

- Default deny: `src/proxy.ts` returns 401 JSON for every `/api/**` and `/mcp` request unless the route is in the public list, or the request carries a valid bearer key or owner session. Owner pages redirect to `/login`.
- Only `NEXT_PUBLIC_*` values reach the browser. Secrets stay server-side and are never logged.
- Spend caps: `MAX_LAUNCH_SOL` and `MAX_DAILY_SPEND_SOL`.
- The treasury private key (`TREASURY_PRIVATE_KEY`) is read only in memory behind the approval gate, and only in the host's secret store.
- Wallet and keypair files are git-ignored (`devnet-*.json`, `*keypair*.json`, `wallet*.json`).

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for the exact Vercel settings, env var list, cron, Telegram setup, post-deploy checks and the mainnet checklist.

## Licence

MIT, see [LICENSE](LICENSE). The sample avatar `public/avatar/sample_b.vrm` is by the VRoid Project and has its own terms, see [public/avatar/LICENSE.md](public/avatar/LICENSE.md).
