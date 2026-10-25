# Deploying RakazaTokenization to Vercel

Status: **prepared, not deployed.** Nothing here has been pushed to GitHub or sent to Vercel. Follow it top to bottom when the owner says go. Default is devnet. Mainnet is the last section and is a separate decision.

Sources checked on 2026-10-25: Vercel docs for Next.js, build configuration, environment variables, functions (max duration, regions, runtimes), cron jobs (usage and pricing), supported Node.js versions, and Git deployments.

## 1. Project settings (Vercel dashboard, New Project)

| Setting | Value | Why |
|---|---|---|
| Framework preset | **Next.js** | auto-detected from `package.json` |
| Root directory | the folder that holds `package.json` (this repo's root, `app/` if the repo is the parent folder) | `vercel.json` and `package.json` must be at the root directory |
| Install command | leave default (`npm install`; Vercel picks npm from `package-lock.json`) | lockfile is npm. `npm ci` also works and was tested |
| Build command | leave default (`next build`, which is the `build` script) | tested: clean clone, `npm ci`, `next build`, Node 22, passes |
| Output directory | leave default (Next.js preset handles `.next`) | do not set `public` or `out` |
| Node.js version | **22.x** | pinned in `package.json` `engines.node`. Vercel default is 24.x, Node 20 is deprecated (Oct 2026). You can also set it in Project Settings, General. `engines.node` overrides the dashboard setting (Vercel docs), so the dashboard value does not matter as long as `engines` says 22.x |
| Fluid compute | leave on (default for new projects) | gives Hobby a 300 s default and maximum function duration |
| Production branch | `main` | push only `main`. The local `backup/state-1800` branch is not for GitHub |
| Function region | default `iad1` (Washington DC) is fine. Pick one near the users in Settings, Functions, Region. Multi-region needs Pro | not set in `vercel.json` on purpose, so the dashboard decides |
| Deployment Protection | Standard (default). Protects preview URLs, not the production domain | previews of this app would ask for a Vercel login. That is what we want |

Turbopack is the default Next.js 16 bundler and needs no flag. `src/proxy.ts` is the Next 16 replacement for middleware and runs on the Node runtime.

## 2. What `vercel.json` does (and does not)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/distribute", "schedule": "0 6 * * *" }]
}
```

- Validated against the official schema (`https://openapi.vercel.sh/vercel.json`) with a negative control.
- **No `functions` block.** Durations are set in code with `export const maxDuration` (a `functions` glob that matches nothing can fail a deploy):
  - Route handlers: `/mcp`, `/api/v1/tools/[tool]`, `/api/telegram/webhook`, `/api/cron/distribute` at 60 s.
  - Pages that host server actions: `/launch` 120 s, and 60 s for `/studio`, `/studio/create`, `/trade`, `/scanner`, `/history`, `/fees`, `/ledger`, `/revenue`, `/rewards`, `/dash`, `/settings/integrations`. A server action runs under the limit of the page it was called from.
  - Hobby maximum is 300 s, Pro maximum 800 s, so all of these are inside every plan.
- **Runtime:** every route is Node.js (`runtime = "nodejs"` where it is stated, Node by default elsewhere). Do not move anything to Edge. Edge limits each env var to 5 KB and has no `node:crypto`, `@solana/web3.js` or `pump-sdk` support. Nothing in the app needs Edge.
- **Region:** not pinned in `vercel.json`. If you want it fixed in code, add `"regions": ["fra1"]` (one region only on Hobby).

## 3. Environment variables

Rules (from the Vercel docs):

- Set them in **Project Settings, Environment Variables**, scope **Production** (add **Preview** only for the non-secret ones you want there). Changes apply to new deployments only, so redeploy after changing any value.
- Total limit is 64 KB per deployment.
- Mark every secret as **Sensitive** (write-only). Secrets are set in Vercel only. They are never committed, never printed, never put in `NEXT_PUBLIC_*`.
- `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**. Set them before the build that should use them, and redeploy after any change.
- `EXECUTE_ENABLED` is the only switch that lets the server sign or send a transaction. For the first deploy it stays **unset**.

### 3a. Required for the first deploy

**The app now builds and serves its public pages with ZERO env vars** (verified on a clean clone, Node 22, `env -i`): a missing `SESSION_SECRET`/`CRON_SECRET`/`LIVE_SECRET` no longer breaks the build; owner login answers 503 "not configured" until you set them. Add the keys below to make the owner side usable.

The app builds and the public site works with only the first four. The rest of this table is what makes the owner side and registration usable. Verified: a clean clone built and served with only the first four plus the two owner-login variables.

| Variable | Secret? | Value / rule |
|---|---|---|
| `SESSION_SECRET` | **yes** | 32+ random characters (`openssl rand -hex 32`). Signs the owner cookie. Without it, login answers 503 and owner features refuse |
| `CRON_SECRET` | **yes** | 32+ random characters. Vercel sends it as `Authorization: Bearer ...` to cron paths |
| `LIVE_SECRET` | **yes** | 32+ random characters. Signs live-queue tickets |
| `NEXT_PUBLIC_APP_URL` | no | the final public origin, no trailing slash, for example `https://rakaza.xyz`. See section 5 |
| `NEXT_PUBLIC_SOLANA_NETWORK` | no | `devnet` for the first deploy |
| `DASHBOARD_PASSWORD` | **yes** | owner login at `/login` |
| `API_SERVER_KEY` | **yes** | 16+ characters. Owner bearer for `/api/*`, `/mcp`, and `/api/telegram/setup` |
| `DATABASE_URL` | **yes** | Neon Postgres. Without it `/api/public/register`, `/api/public/fees` and the ledgers answer 503 "not configured". The schema is created on first use (additive only) |
| `UPSTASH_REDIS_REST_URL` | no | Redis for approvals and rate limits |
| `UPSTASH_REDIS_REST_TOKEN` | **yes** | read/write token |
| `UPSTASH_READONLY_TOKEN` | **yes** | read-only token for public GET routes |

Generate each secret separately. Do not reuse one value for two names.

### 3b. Optional (feature stays "not configured" until set)

| Variable | Secret? | Feature |
|---|---|---|
| `TREASURY_PUBKEY` (alias `NEXT_PUBLIC_TREASURY_PUBKEY`) | no | treasury address shown on Vault and Contract, used by the 70/30 split |
| `NEXT_PUBLIC_TOKEN_MINT` | no | our coin's mint, shows the CA pill on Home |
| `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL` | no | header icons |
| `NEXT_PUBLIC_JUPITER_PUBLISHABLE_KEY` | no (browser safe) | Jupiter plugin |
| `HELIUS_DEVNET`, `HELIUS_MAINNET` | **yes** (the URL carries an API key) | full RPC URL including the API key. Needed for balance checks, health and launches on that network |
| `JUPITER_API_KEY`, `SOLANATRACKER_API_KEY`, `PIMLICO_API_KEY` | **yes** | quotes, holder data, secondary RPC |
| `PINATA_API_KEY`, `PINATA_API_SECRET`, `PINATA_JWT` | **yes** | IPFS pinning for launch metadata and memes |
| `RIVER_BASE_URL`, `RIVER_MODEL_AGENT`, `RIVER_MODEL_PERSONA` | no | AI brain config |
| `RIVER_AGENT`, `RIVER_RAKAZO` | **yes** | AI brain keys. Without them `/api/chat` answers 502 `brain_unavailable` |
| `NEON_AI_GATEWAY_TOKEN` (+ `NEON_AI_GATEWAY_BASE_URL`, not secret) | **yes** | fallback LLM gateway |
| `DEEPGRAM_API_KEY` | **yes** | voice. Without it `/api/voice/*` answer 503 `voice_not_configured` |
| `RAKAZA_VOICE` | no | voice name, default `aura-2-luna-en` |
| `BRAVE_SEARCH_API_KEY`, `FIRECRAWL_API_KEY` | **yes** | agent web tools |
| `POLLINATIONS_API_KEY` | **yes** | studio image generation (owner only) |
| `POLLINATIONS_IMAGE_MODEL` | no | default `flux` |
| `UPCLOUD_API_TOKEN` | **yes** | read-only server status on `/infra` |
| `TELEGRAM_BOT_TOKEN` | **yes** | control bot, see section 4 |
| `TELEGRAM_ADMIN_ID` | no | your numeric Telegram user id, the only person the bot obeys |
| `TREASURY_ENCRYPTION_KEY` | **yes** | only if the treasury key is stored encrypted |
| `SPONSORED_ENABLED`, `MAX_LAUNCH_SOL` (default 0.5), `MAX_DAILY_SPEND_SOL` (default 1) | no | spend gates and caps |
| `TREASURY_PRIVATE_KEY` | **yes, highest risk** | signer. **Not for the first deploy.** Only with the mainnet checklist (section 7), or a devnet key for devnet execution tests |
| `EXECUTE_ENABLED` | no, but dangerous | `true` allows signing. Leave unset until you mean it |

Never set in Vercel: `DEV_PREVIEW_OWNER_PAGES` (dev only, ignored in production), `TELEGRAM_MOCK`, `BASE`, `APP_URL` (used only by the local `scripts/telegram-poll.mjs`), and `VERCEL_TOKEN` (builder tooling, not a runtime variable).

## 4. Telegram

1. Create the bot with @BotFather, copy the token.
2. In Vercel set `TELEGRAM_BOT_TOKEN` (Sensitive) and `TELEGRAM_ADMIN_ID` (your numeric id). Redeploy.
3. Register the webhook once, with the owner key (the call goes to Telegram, so run it only when you want the bot live):

   ```bash
   curl -X POST https://YOUR-DOMAIN/api/telegram/setup \
     -H "Authorization: Bearer $API_SERVER_KEY" \
     -H "content-type: application/json" \
     -d '{"baseUrl":"https://YOUR-DOMAIN"}'
   ```

   `baseUrl` must be `https://host` with no path. Send `{"baseUrl":""}` to remove the webhook.
4. There is no webhook secret to configure. Telegram's secret header is derived from the bot token, so rotating the token means running step 3 again.
5. Check: `POST /api/telegram/webhook` without the secret header returns 401 (503 if no token is set). The bot ignores everyone except `TELEGRAM_ADMIN_ID`. Do not use `scripts/telegram-poll.mjs` in production, it is for local testing.

## 5. Production domain

- `NEXT_PUBLIC_APP_URL` is the one place the domain is configured. It sets `metadataBase` (OpenGraph and canonical links) and the example URLs on `/docs`, `/docs/api`, `/docs/mcp` and `/docs/agents`.
- `/skill.md` and the MCP examples derive the host from the incoming request, so they are always right.
- The owner cookie (`rk_owner`) is host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, so it works on any domain and needs no domain setting.
- Because it is inlined at build time: the first build must already know the final domain. If the custom domain is not attached yet, use the Vercel alias (`https://<project-name>.vercel.app`), deploy, attach the domain (Settings, Domains), change `NEXT_PUBLIC_APP_URL`, and redeploy.
- `robots.txt` currently says `Disallow: /` (Phase 1 setting). Open it in `src/app/robots.ts` when the site should be indexed. That is a launch decision, not a deploy requirement.

## 6. Cron: `/api/cron/distribute` (and `/api/cron/index-trades`)

`/api/cron/index-trades` (daily, `0 7 * * *`) catches the public trade index up for every launched token. Same bearer rule as below; it never signs or sends anything. Token pages also index lazily when they are read, so the daily run is only a safety net.

What it does: pays out accrued creator fees for every live launch. Behaviour is gated:

- no bearer: 401
- bearer is `CRON_SECRET` or `API_SERVER_KEY`, but `EXECUTE_ENABLED` is not `true`: **503**, nothing happens
- execution on: runs `distributeAll()`; payout rows are unique per (signature, wallet), so a retry cannot double pay

Schedule options:

| Plan | Option | `schedule` |
|---|---|---|
| **Hobby** | the only allowed kind: **once a day**. A faster expression makes the deploy fail with "Hobby accounts are limited to daily cron jobs". Timing is only accurate to within the hour (up to 59 minutes late) | `0 6 * * *` (06:00 UTC, what `vercel.json` has) |
| Pro | every 15 minutes, hourly, etc. | `*/15 * * * *` or `0 * * * *` |
| Any plan | external scheduler (cron-job.org, GitHub Actions, the owner's agent) calling `GET /api/cron/distribute` with `Authorization: Bearer $CRON_SECRET` | any |
| Manual | owner presses "distribute now" in History, or the Telegram bot | n/a |

Notes: schedules are UTC. Crons run only on the **production** deployment, never on previews. Vercel calls with GET and the bearer built from `CRON_SECRET`, which is why that variable must exist. Until `EXECUTE_ENABLED=true` the daily call just logs a 503, which is expected. If you do not want the daily call at all, remove the `crons` block from `vercel.json`.

## 7. Mainnet switch checklist

Do this only after the devnet deploy has passed section 8 and the owner has said "mainnet".

1. `NEXT_PUBLIC_SOLANA_NETWORK` = `mainnet-beta` (public, inlined at build, so **redeploy**).
2. `TREASURY_PUBKEY` (and `NEXT_PUBLIC_TREASURY_PUBKEY`) = the **real** treasury public key. Confirm it matches the signer below before anything else.
3. `HELIUS_MAINNET` = a mainnet RPC URL (Sensitive). Confirm `/api/health` reports `"network":"mainnet-beta"`.
4. Caps: set `MAX_LAUNCH_SOL` and `MAX_DAILY_SPEND_SOL` to small numbers first (the defaults are 0.5 and 1). Raise later, not now.
5. `TREASURY_PRIVATE_KEY` = a valid key (base58 or JSON byte array) for that exact pubkey, added in Vercel as Sensitive, **only in Vercel**. Not in git, chat, logs, or `.env` files. Fund the treasury with a small amount.
6. The devnet wallet files (`/home/box/devnet-*.json` and any `*keypair*.json`) stay untouched and are never uploaded. Do not reuse a devnet key on mainnet.
7. Redeploy, then run `/dash` health panel: treasury check must be green and its derived public key must equal `TREASURY_PUBKEY`.
8. Do one tiny owner-approved launch with the approval gate on. Check the transaction on an explorer.
9. Only then set `EXECUTE_ENABLED=true` (this also turns on the daily cron payout).
10. Rollback: unset `EXECUTE_ENABLED` and redeploy. This stops every signature at once.

## 8. Post-deploy verification checklist

Replace `$D` with the deployment URL (`export D=https://...`). Expected codes were measured on a production build with `next start` and no keys configured; a configured deployment may return 200 where this table says 503/502.

**Public pages, expect 200:** `/`, `/agents`, `/diary`, `/docs`, `/docs/agents`, `/docs/api`, `/docs/mcp`, `/games`, `/games/neon-runner`, `/games/ride-em`, `/games/trench-sim`, `/giveaway`, `/live`, `/login`, `/memes`, `/privacy`, `/register`, `/roadmap`, `/stake`, `/studio`, `/studio/create`, `/studio/explore`, `/studio/help`, `/studio/learn`, `/studio/me`, `/talk`, `/terms`, `/explore`, `/token/<mint>`, `/skill.md`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/openapi.json`, `/opengraph-image`, `/icon.svg`, `/studio/i/x`, `/studio/3d/x`.

**Owner pages, expect 307 to `/login?next=...` when signed out** (200 after `/login`): `/dash`, `/dash/agents`, `/dev`, `/ledger`, `/fees`, `/history`, `/infra`, `/keyvault`, `/kit`, `/lab`, `/launch`, `/pool`, `/revenue`, `/rewards`, `/scanner`, `/settings`, `/settings/integrations`, `/shield`, `/splits`, `/studio/mod`, `/studio/owner`, `/trade`, `/vanity`, `/vault`.

**404 on purpose:** `/design` (dev-only page) and any unknown path.

**API routes (no credentials):**

| Request | Expect |
|---|---|
| `GET /api/health` | 200 `{"ok":true,"envValid":true,"execute":"blocked"}` (`network` must match what you set) |
| `GET /api/nonexistent` | 401 (default deny hides everything not public) |
| `GET /api/v1/tools`, `POST /api/v1/tools/<tool>` | 401 |
| `GET` or `POST /mcp` | 401 |
| `POST /api/telegram/setup` | 401 |
| `GET /api/cron/distribute` | 401 |
| `POST /api/telegram/webhook` without secret header | 401 (503 if no bot token) |
| `GET /api/public/fees` | 400 (needs `?wallet=ADDRESS`); with a wallet: 200, or 503 if no database |
| `POST /api/public/register` | 200 with a key, or 503 if no database |
| `POST /api/auth/login` wrong password | 401 `wrong_password` |
| `POST /api/chat` | 200, or 502 `brain_unavailable` without River keys |
| `POST /api/voice/token`, `/api/voice/tts` | 200, or 503 `voice_not_configured` |
| `GET` on POST-only routes (`/api/auth/*`, `/api/chat`, `/api/voice/*`, `/api/public/register`, `/api/telegram/webhook`) | 405 |

**API routes (owner bearer `Authorization: Bearer $API_SERVER_KEY`):**

- `GET $D/api/v1/tools` returns 200 with the tool list; `POST $D/api/v1/tools/platform_info` with `{}` returns 200.
- `POST $D/mcp` with a JSON-RPC `initialize` (headers `accept: application/json, text/event-stream`) returns 200.
- `GET $D/api/cron/distribute` with `Authorization: Bearer $CRON_SECRET` returns 503 while `EXECUTE_ENABLED` is unset. A 503 here is the correct, safe answer.
- Log in at `/login`, then every owner page above returns 200 and `/dash` health panel loads.

**Other checks:**

- `GET $D/skill.md` lists the tools and shows your domain, not localhost.
- `/docs/api`, `/docs/mcp` show your domain in the examples (confirms `NEXT_PUBLIC_APP_URL` was set before the build).
- View page source: no secret value appears anywhere (search for part of `SESSION_SECRET`).
- Vercel dashboard, Settings, Cron Jobs shows `/api/cron/distribute`.
- Vercel logs: no 500 on the routes above.
- `/studio`: generator shows "Owner sign-in required" when signed out and works after login.

## 9. Local rehearsal (what was run)

```bash
npm ci
env -i PATH=$PATH SESSION_SECRET=... CRON_SECRET=... LIVE_SECRET=... \
  NEXT_PUBLIC_APP_URL=https://example.test NEXT_PUBLIC_SOLANA_NETWORK=devnet \
  DASHBOARD_PASSWORD=... API_SERVER_KEY=... node node_modules/next/dist/bin/next build
# same env:
node node_modules/next/dist/bin/next start -p 3300
```

Run on Node 22.x from a fresh clone of the committed files. Result and evidence are in `docs/reviews/phase9-readiness.md`.
