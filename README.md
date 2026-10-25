<p align="center">
  <img src="docs/images/banner.jpg" alt="Rakaza AI Terminal: a Solana token launchpad with an AI character" width="100%">
</p>

<h1 align="center">Rakaza AI Terminal</h1>
<p align="center"><b>A self-hostable Solana launchpad for pump.fun, with an AI character, a permanent 70/30 fee split, vanity grinding, an agent API (REST + MCP) and a Telegram admin bot.</b><br>
Clone it, add your API keys, and run it as your own launchpad.</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white">
  <img alt="Node 22" src="https://img.shields.io/badge/Node-22.x-339933?logo=nodedotjs&logoColor=white">
  <img alt="Solana" src="https://img.shields.io/badge/Solana-devnet%20first-9945ff?logo=solana&logoColor=white">
  <img alt="Deploy" src="https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel">
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-green">
</p>

> **Status: devnet first.** Nothing is ever signed or sent unless `EXECUTE_ENABLED` is exactly `true`. Mainnet is a separate, deliberate switch: see the [mainnet checklist](#devnet-first-then-mainnet).
> **The repo contains no secrets.** It builds and serves its public pages with zero environment variables; features that need a key say "not configured" until you add it.

---

## Table of contents

1. [What it is](#what-it-is)
2. [Feature highlights](#feature-highlights)
3. [The dashboard and every tab](#the-dashboard-and-every-tab)
4. [Launching a coin](#launching-a-coin)
5. [Fees: the 70/30 split and the self-launch service fee](#fees-the-7030-split-and-the-self-launch-service-fee)
6. [Architecture](#architecture)
7. [Security model](#security-model)
8. [Quick start](#quick-start)
9. [Environment variables](#environment-variables)
10. [One-go Vercel deploy](#one-go-vercel-deploy)
11. [Devnet first, then mainnet](#devnet-first-then-mainnet)
12. [Project structure](#project-structure)
13. [Scripts and tests](#scripts-and-tests)
14. [FAQ and troubleshooting](#faq-and-troubleshooting)
15. [Make it your own launchpad](#make-it-your-own-launchpad)
16. [Brand kit](#brand-kit)
17. [Guides for AI agents, links and build history](#guides-for-ai-agents-links-and-build-history)
18. [License](#license)

---

## What it is

Rakaza is a Next.js 16 app that has two faces:

- **A public site** with an AI character (3D VRM avatar, voice, chat), a risk checker for pump.fun coins, a diary, memes, mini-games, a Studio and docs.
- **An owner dashboard** (behind a password) that scans a token, rewrites it, generates art, optionally grinds a vanity address, simulates the launch, and launches it on **pump.fun** with a **permanent on-chain fee split**.

It also exposes the same tools to AI agents over **REST (`/api/v1/tools`)**, **MCP (`/mcp`)** and a plain-text **`/skill.md`**, and to you over a **Telegram admin bot**.

<p align="center"><img src="docs/images/dashboard-preview.jpg" alt="Dashboard preview" width="92%"></p>

## Feature highlights

| | |
|---|---|
| **One-paste agent launch** | Paste a contract address. The agent runs Vamp Radar/Shield, studies the token, writes a new name/ticker/description, generates an image (FLUX), pins metadata to IPFS, simulates, and waits for your approval. |
| **Fees that are easy to explain** | Sponsored launches: permanent 70/30 split, verified on-chain before any dev buy. Self launches: **no split**, you keep 100% of creator fees and pay one flat service fee (about $2 in SOL) inside the launch transaction. |
| **Vanity grinder** | Grind mint addresses in browser Web Workers (libsodium). The secret key never leaves the browser. Also a CLI and a shareable "grind pool". |
| **Safety gates** | Approval tickets, per-launch and daily spend caps, kill switch, default-deny proxy. |
| **Agent platform** | 24 tools over REST and MCP, per-user agent keys, `skill.md` for self-onboarding. |
| **AI character** | VRM avatar, Deepgram speech in/out, River AI brain, 18+ gate. |
| **Telegram admin bot** | `/scan`, `/launch`, `/fees`, `/verify` and more, admin-only. |
| **Zero-key first deploy** | Builds and serves with no env at all. Add keys later in Vercel. |

## The dashboard and every tab

The owner area is behind `/login`. Public pages work without it.

### Two ways to launch (and the floating chat)

| Mode | Where | Who pays | Who owns the token | Split |
|---|---|---|---|---|
| **Sponsored free launch** ("Agent launch") | `/launch` (owner) | The platform treasury agent wallet pays every fee | The platform is the creator; the launcher you name gets the fee share | **You 70% · Platform 30%** |
| **Self launch** | `/self-launch` (public, any user) | The user's own wallet pays all fees and the optional dev buy | **The user is the creator. The platform owns nothing** | **You keep 100% of creator fees** · flat service fee (default $2, paid in SOL) |

<p align="center"><img src="docs/images/self-launch.jpg" alt="Self launch" width="46%"> <img src="docs/images/widget-3d.jpg" alt="Floating Rakaza chat (3D)" width="46%"></p>

- **Sponsored launcher** (`/launch`, owner only) is only the sponsored agent launcher. It asks for exactly one thing, the wallet that should receive the 70% fee share (never prefilled with the treasury). The treasury agent wallet does the rest and pays. There is no self-launch step, chip or panel on it, only a small link to `/self-launch`.
- **Self launch** (`/self-launch`, public) is a complete standalone tab with the same agentic pipeline for someone paying from their own wallet: (1) connect Phantom or Solflare, (2) paste a token address, (3) Vamp Radar/Shield scan, (4) River analysis, rewrite and copy-risk check, (5) image (Pollinations FLUX, limited per wallet and IP, or upload your own), (6) metadata pinned to IPFS server side, (7) Launch Kit checklist, (8) edit anything, optional vanity mint address and mint-key backup download (keys never leave the browser), optional dev buy, (9) **Get my quote**: pump.fun cost + network fees + service fee (+ dev buy) = total, simulated first, (10) confirm and approve once in your wallet. The platform never signs: the mint signs first, then your wallet. You are the creator, you keep the token, the contract and **100% of the creator fees**. Safe for non-owners: rate limited, no treasury spend, no owner session, size and magic-byte checked images, the server checks the transaction before relaying it (service fee goes to the exact treasury address, amount within 2% of the quote, you are the creator). It does **not** need `EXECUTE_ENABLED`; it is on by default on devnet (`SELF_LAUNCH_ENABLED=true` allows it on mainnet, `false` turns it off).
- **Floating Rakaza chat**: a bubble at the bottom right of every public page and the dashboard. The panel (the same 3D VRM avatar as `/talk` on every device including phones, lazy-loaded only when opened with a "Waking Rakaza up…" state and a lower pixel ratio on small screens; the 2D avatar is only a fallback when WebGL or the VRM load fails, or if you tap the 3D/2D toggle) chats with the River brain, speaks replies with the Luna voice only after you send a message, has an optional mic, minimize and "open full /talk".
- **Studio, My studio** (`/studio/me`): your launches and images on this device (localStorage, no sign-in).

<table>
<tr>
<td width="50%"><img src="docs/images/tab-launch.jpg" alt="Launch"><br><b>Launch</b>: paste a token, the agent does the rest (scan, rewrite, image, IPFS, simulate, approve, launch with the split).</td>
<td width="50%"><img src="docs/images/tab-shield.jpg" alt="Shield"><br><b>Vamp Radar / Shield</b>: find lookalikes of any contract address and see how cheap it is to fake yours.</td>
</tr>
<tr>
<td><img src="docs/images/tab-lab.jpg" alt="Lab"><br><b>Lab</b>: test a launch on the bonding curve with dev buys and team wallets before shipping.</td>
<td><img src="docs/images/tab-kit.jpg" alt="Kit"><br><b>Kit</b>: fill the coin in once, get the metadata file, a launch post and a checklist.</td>
</tr>
<tr>
<td><img src="docs/images/tab-pool.jpg" alt="Pool"><br><b>Pool</b>: share one link; friends grind in their browsers and send back sealed codes only you can open.</td>
<td><img src="docs/images/tab-splits.jpg" alt="Splits"><br><b>Splits</b>: decode and verify any on-chain fee-share config. Permanent once set.</td>
</tr>
<tr>
<td><img src="docs/images/tab-vanity.jpg" alt="Vanity"><br><b>Vanity</b>: Web-Worker grinder for custom mint addresses (starts with / ends with).</td>
<td><img src="docs/images/tab-keyvault.jpg" alt="Key vault"><br><b>Key vault</b>: grinder keys encrypted under your passphrase, in the browser only.</td>
</tr>
<tr>
<td><img src="docs/images/tab-vault.jpg" alt="Vault"><br><b>Vault</b>: treasury balance, spend caps, recent activity. The secret key is never shown.</td>
<td><img src="docs/images/tab-fees.jpg" alt="Fees"><br><b>Fees</b>: what every wallet has earned, what is waiting, what was sent.</td>
</tr>
<tr>
<td><img src="docs/images/tab-trade.jpg" alt="Trade"><br><b>Trade</b>: live Jupiter quote and route before any trade.</td>
<td><img src="docs/images/tab-rewards.jpg" alt="Rewards"><br><b>Rewards</b>: per token, who gets what, what is waiting and what was sent.</td>
</tr>
<tr>
<td><img src="docs/images/tab-revenue.jpg" alt="Revenue"><br><b>Revenue</b>: the platform's 30% share, last 30 days, by token.</td>
<td><img src="docs/images/tab-history.jpg" alt="History"><br><b>History</b>: every launch, its transactions and where each wallet's fees stand.</td>
</tr>
<tr>
<td><img src="docs/images/tab-explore.jpg" alt="Explore"><br><b>Explore</b>: search and filter all launches; open one to verify it.</td>
<td><img src="docs/images/tab-scanner.jpg" alt="Scanner"><br><b>Scanner</b>: rug/risk scan (holders, organic score, bundlers, snipers), watchlist, copycat finder.</td>
</tr>
<tr>
<td><img src="docs/images/tab-agents.jpg" alt="Operator agents"><br><b>Operator agents</b>: everyone who registered an agent key; switch a key off if abused.</td>
<td><img src="docs/images/tab-dev.jpg" alt="Dev"><br><b>Dev</b>: the command-line vanity grinder and core API, with a quick start.</td>
</tr>
<tr>
<td><img src="docs/images/tab-dash.jpg" alt="Dashboard"><br><b>Dashboard</b>: network, treasury, launch execution gate, key health, integrations health.</td>
<td><img src="docs/images/tab-infra.jpg" alt="Infra"><br><b>Infra</b>: read-only server status (UpCloud). Start/stop only with approval.</td>
</tr>
<tr>
<td><img src="docs/images/tab-settings.jpg" alt="Settings"><br><b>Settings</b>: network, RPC health, key health (ok/missing), limits, logout.</td>
<td><img src="docs/images/tab-studio.jpg" alt="Studio"><br><b>Studio</b>: make a face for your coin: character design and token logo, handed off to Launch.</td>
</tr>
<tr>
<td><img src="docs/images/tab-talk.jpg" alt="Talk"><br><b>Talk / avatar / voice</b>: chat with the 3D character, voice in and out, 18+ gate.</td>
<td><img src="docs/images/tab-home.jpg" alt="Home"><br><b>Home</b>: the public landing page: character, risk checker, playground.</td>
</tr>
</table>

**On a phone** the whole thing is responsive, with a bottom nav and a menu sheet:

<p align="center"><img src="docs/images/mobile-strip.jpg" alt="Mobile views" width="100%"></p>

| Tab | Route | Access | What it does |
|---|---|---|---|
| Launch | `/launch` | owner + agent | Scan, rewrite, image, IPFS, simulate, approve, launch with the split |
| Vamp Radar / Shield | `/shield` | owner | Lookalike address detection and clone-cost scoring |
| Kit | `/kit` | owner | Metadata file, launch post, checklist |
| Lab | `/lab` | owner | Bonding-curve launch simulation |
| Pool | `/pool` | owner | Team vanity grinding via a shared link |
| Splits | `/splits` | owner + agent | Decode/verify on-chain fee shares |
| Vanity | `/vanity` | owner | In-browser vanity mint grinder |
| Key vault | `/keyvault` | owner | Passphrase-encrypted key storage (browser only) |
| Vault | `/vault` | owner + agent | Treasury status, caps, audit log |
| Fees | `/fees` | owner + agent | Collect and distribute creator fees |
| Trade | `/trade` | owner + agent | Jupiter quotes; swaps are gated |
| Rewards / Revenue / History | `/rewards` `/revenue` `/history` | owner | Ledgers |
| Explore | `/explore` | owner | All launches |
| Scanner | `/scanner` | owner | Risk scan |
| Operator agents | `/dash/agents` | owner + agent | Agent console |
| Infra | `/infra` | owner | Server status |
| Settings | `/settings` | owner | Health and limits |
| Studio | `/studio` | public | Character and logo generator |
| Talk | `/talk` | public | AI character chat with voice |
| Dev CLI & core API | `/dev`, `cli/` | owner | Command-line grinder |
| Telegram admin bot | `/api/telegram/webhook` | admin id | Remote control |
| MCP & skill | `/mcp`, `/skill.md` | agent key / public | Agent tools and self-onboarding |
| API | `/api/v1/tools`, `/api/health`, `/docs/api` | agent key / public | REST mirror of the tools |

### Telegram admin bot
Admin-only (your numeric Telegram id). Commands: `/status` `/health` `/balance` `/scan <mint>` `/draft <mint>` `/launch <mint>` `/resume` `/launches` `/fees` `/verify <mint>` `/lookalikes <mint>` `/wallet` `/voice on|off` `/tools` `/how`. Launches are prepared by the bot and only run after you tap approve. Webhook mode on Vercel, polling mode locally (`scripts/telegram-poll.mjs`).

### MCP and skill.md
Any agent can read `/skill.md`, register at `/register`, get a bearer key and call the tools at `/mcp` (Streamable HTTP) or `/api/v1/tools` (REST). Tool examples: `scan_token`, `vamp_scan`, `draft_token`, `generate_image`, `preview_fee_split`, `simulate_launch`, `prepare_launch_package`, `verify_launch`, `wallet_fees`, `jupiter_quote`, `rugcheck_token`, `trust_check`. See `/docs/api` and `/docs/mcp`.

## Launching a coin

<p align="center"><img src="docs/images/launchpad-preview.jpg" alt="Launchpad preview" width="92%"></p>

1. **Scan**: Vamp Radar/Shield checks the contract address, lookalikes and risk.
2. **Rewrite**: the River AI brain proposes a new name, ticker and description.
3. **Image**: Pollinations FLUX generates art; metadata is pinned to IPFS (Pinata).
4. **Vanity (optional)**: grind a custom mint address in the browser.
5. **Fees**: sponsored launches use the 70/30 split; self launches have no split (you keep 100%) and show a quote with the flat service fee.
6. **Simulate**: the transactions are simulated against the RPC.
7. **Approve and launch**: an approval ticket is signed; the transactions are sent.

## Fees: the 70/30 split and the self-launch service fee

<p align="center"><img src="docs/images/share-card.jpg" alt="70/30 split" width="80%"></p>

Creator fees on pump.fun can be shared between wallets via a **fee-sharing config**.

- **Sponsored launch, 70/30**: a launch done *for* a user, paid by the platform treasury agent wallet. `7000 bps` to the user's fee wallet, `3000 bps` to the platform treasury.
- **Self launch, no split**: the user launches from their own wallet. There is **no fee-sharing config**, so pump.fun's default applies: the creator (the user) gets 100% of the creator fees. The platform charges one flat **service fee**, `SELF_LAUNCH_SERVICE_FEE_USD` (default `2`), converted to SOL with the Jupiter price at quote time and sent as a `SystemProgram.transfer` to the treasury **inside the same create transaction** (if the token is not created, the fee is not paid). A quote is valid for 5 minutes. If the price lookup fails, `SELF_LAUNCH_SERVICE_FEE_SOL` (default `0.015`) is used and the UI says so. Typical total: pump.fun cost (about $1.5) + service fee ($2) = about $3.5, plus network fees and an optional dev buy. The quote screen shows every line, and the user ticks a confirmation before the wallet opens.
- **Self-launch safety**: the platform never signs for the user, the creator is the user's wallet, the mint signs first, and the server verifies the signed transaction (exactly one transfer to the exact treasury pubkey, amount within 2% of the quote, nothing else moves SOL) before relaying. Honest limit: because the platform does not co-sign, a user can always bypass our relay and send a transaction to the RPC themselves; they then simply skip our fee, and nothing else changes for them. Test: `tests/service-fee.ts`.
- **Never the same wallet twice**: the fee wallet cannot be the platform treasury (the UI, server actions, Telegram bot and API tools all block it with a friendly message). Test: `tests/treasury-clash.ts`.
- **Permanent**: `updateFeeSharesV2` revokes the admin, so the split can be set **once** and never changed. That is the point: users can verify it on-chain.
- **Transactions**: TX1 `createV2` (the mint co-signs). TX2 `createFeeSharingConfig` + `updateFeeSharesV2`. TX3 (optional) the dev buy. The dev buy lives in its own transaction because the three together exceed the 1232-byte transaction size limit.
- **Verified first**: the code reads the config back on-chain and compares it before any dev buy runs.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI<br/>public site + owner dash]
    VAN[Vanity Web Workers<br/>libsodium]
    AV[3D avatar + voice<br/>three / VRM / Deepgram]
  end
  subgraph Vercel
    PX[src/proxy.ts<br/>default-deny gate]
    API[/api/*  /mcp  /skill.md/]
    ACT[Server actions<br/>launch / fees / history]
    CRON[/api/cron/distribute<br/>daily/]
    TG[/api/telegram/webhook/]
  end
  subgraph Services
    RPC[Helius RPC]
    PUMP[pump.fun<br/>@pump-fun/pump-sdk]
    JUP[Jupiter / SolanaTracker]
    AI[River AI / Deepgram / Pollinations FLUX]
    STORE[(Neon Postgres<br/>Upstash Redis<br/>Pinata IPFS)]
  end
  AGENTS[AI agents<br/>MCP / REST] --> PX
  TGU[Telegram admin] --> TG
  UI --> PX --> API
  PX --> ACT
  ACT --> PUMP --> RPC
  API --> JUP
  API --> AI
  ACT --> STORE
  CRON --> ACT
  UI --- VAN
  UI --- AV
```

## Security model

- **Default-deny proxy** (`src/proxy.ts`): every owner page redirects to `/login`; every `/api/*` and `/mcp` call returns 401 unless it is on an explicit public list or carries a valid key.
- **Owner session**: signed, httpOnly cookie via `DASHBOARD_PASSWORD` + `SESSION_SECRET`. Agents use `API_SERVER_KEY` or a per-user key (stored hashed).
- **Execution gate**: no signature or send unless `EXECUTE_ENABLED=true`. Spend caps (`MAX_LAUNCH_SOL`, `MAX_DAILY_SPEND_SOL`) and a kill switch.
- **Approval tickets**: HMAC-signed over the exact launch plan; if the plan changes after approval, the ticket is invalid. Tickets expire.
- **Mint keys are sealed**: the new mint's secret is AES-GCM sealed between prepare and launch; it never goes to the browser in the clear.
- **Vanity keys stay in the browser**: grinding and the key vault are client-side only.
- **Headers**: strict CSP with a connect-src allow-list, and other security headers (`next.config.ts`).
- **Telegram**: webhook verifies Telegram's secret header and an admin id.
- **No secrets in git**: `.env*`, key files and wallet files are git-ignored; env var *names* only in `.env.example`.

## Quick start

Requires **Node 22.x** and npm.

```bash
git clone https://github.com/AutoClawGPT/RakazaAiTerminal.git
cd RakazaAiTerminal
npm i                       # or: npm ci
cp .env.example .env.local
# Edit .env.local and add ONLY the API keys listed in the table below.
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # run 3x for SESSION_SECRET, CRON_SECRET, LIVE_SECRET
npm run dev                 # http://localhost:3200
```

Without any keys the public pages still work; each missing key shows up as "missing" in **Dashboard → Integrations health**.

## Environment variables

Names only: values go in `.env.local` (git-ignored) or in Vercel → Settings → Environment Variables. The full annotated list is in [`.env.example`](.env.example) and [`docs/ENV.md`](docs/ENV.md).

| Variable | Needed? | What for | Get it |
|---|---|---|---|
| `SESSION_SECRET`, `CRON_SECRET`, `LIVE_SECRET` | **Required** to log in / run cron / live queue | Generated random strings (32+ chars) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `DASHBOARD_PASSWORD` | **Required** for owner login | Owner password | Choose one |
| `API_SERVER_KEY` | Recommended | Bearer key for agents / cron | Generate (16+ chars) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Optional | `devnet` (default) or `mainnet-beta` | n/a |
| `HELIUS_DEVNET`, `HELIUS_MAINNET` | **Required** to launch | Solana RPC | [helius.dev](https://www.helius.dev/) |
| `TREASURY_PUBKEY` | **Required** to launch | Platform wallet receiving the 30% | Create a wallet (Phantom/Solana CLI) |
| `TREASURY_PRIVATE_KEY` | Required to sign launches | Treasury signer (**secret**, devnet key first) | Your wallet export |
| `PINATA_API_KEY`, `PINATA_API_SECRET` (or `PINATA_JWT`) | Required to launch | IPFS metadata pinning | [pinata.cloud](https://pinata.cloud/) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_READONLY_TOKEN` | Recommended | Rate limits, approvals, pending taps | [upstash.com](https://upstash.com/) |
| `DATABASE_URL` | Recommended | Neon Postgres ledger / history | [neon.tech](https://neon.tech/) |
| `JUPITER_API_KEY`, `NEXT_PUBLIC_JUPITER_PUBLISHABLE_KEY` | Optional | Prices, quotes | [portal.jup.ag](https://portal.jup.ag/) |
| `SOLANATRACKER_API_KEY` | Optional | Holders, bundlers, snipers | [solanatracker.io](https://www.solanatracker.io/) |
| `PIMLICO_API_KEY` | Optional | Secondary RPC / sponsorship | [pimlico.io](https://www.pimlico.io/) |
| `RIVER_AGENT`, `RIVER_RAKAZO`, `RIVER_BASE_URL`, `RIVER_MODEL_*` | Optional | AI brain (operator + public persona) | River AI dashboard |
| `DEEPGRAM_API_KEY` | Optional | Voice in/out | [deepgram.com](https://deepgram.com/) |
| `POLLINATIONS_API_KEY`, `POLLINATIONS_IMAGE_MODEL` | Optional | FLUX images | [gen.pollinations.ai](https://gen.pollinations.ai/docs) |
| `BRAVE_SEARCH_API_KEY` | Optional | Agent web search | [brave.com/search/api](https://brave.com/search/api/) |
| `FIRECRAWL_API_KEY` | Optional | Agent scrape tool | [firecrawl.dev](https://www.firecrawl.dev/) |
| `UPCLOUD_API_TOKEN` | Optional | `/infra` server status | [upcloud.com](https://upcloud.com/) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_ID` | Optional | Admin bot | [@BotFather](https://t.me/BotFather), [@userinfobot](https://t.me/userinfobot) |
| `EXECUTE_ENABLED`, `SPONSORED_ENABLED`, `MAX_LAUNCH_SOL`, `MAX_DAILY_SPEND_SOL` | Optional | Safety gates and caps | n/a |
| `SELF_LAUNCH_SERVICE_FEE_USD` (default `2`), `SELF_LAUNCH_SERVICE_FEE_SOL` (default `0.015`) | Optional | Flat self-launch service fee in USD (paid in SOL, Jupiter price) and its SOL fallback | n/a |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`, `NEXT_PUBLIC_TOKEN_MINT` | Optional | Branding and links | n/a |

## One-go Vercel deploy

The project builds with **no env vars** (keyless first deploy). Then add keys and redeploy.

```bash
npm i -g vercel
vercel login
vercel link                       # create/link the project (framework: Next.js, Node 22.x)
vercel deploy --prod              # first, keyless, deploy
# Add env keys in the dashboard (or `vercel env add NAME production`), then:
vercel deploy --prod
```

Or in the dashboard: **Add New → Project → import the GitHub repo** → leave defaults (Next.js, `npm ci`/`npm install`, `next build`, Node 22.x) → Deploy. Details, cron notes and the post-deploy checklist: [`docs/DEPLOY.md`](docs/DEPLOY.md).

Notes: Hobby plans only allow **daily** cron (`vercel.json` uses `0 6 * * *`), function `maxDuration` is capped at 300s on Hobby, and `NEXT_PUBLIC_*` values are baked in at build time (redeploy after changing them).

## Devnet first, then mainnet

1. Keep `NEXT_PUBLIC_SOLANA_NETWORK=devnet`, a devnet `HELIUS_DEVNET` and a throw-away devnet treasury key. Run a full launch and check **Splits** and **Fees**.
2. Check the on-chain split with **Splits** before enabling any dev buy.
3. Mainnet checklist:
   - [ ] New treasury wallet; only the public key in `TREASURY_PUBKEY`.
   - [ ] `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`, `HELIUS_MAINNET` set.
   - [ ] Small `MAX_LAUNCH_SOL` and `MAX_DAILY_SPEND_SOL` caps.
   - [ ] `DASHBOARD_PASSWORD`, `API_SERVER_KEY`, `SESSION_SECRET` set; Telegram admin id set.
   - [ ] Fund the treasury with a small amount; launch a test coin.
   - [ ] Only then set `EXECUTE_ENABLED=true`. Redeploy.

## Project structure

```
src/
  app/            Next.js App Router: (site) public, (dash) owner, (talk), api/, mcp/, skill.md/
  components/     UI, brand, chrome (nav), avatar, vanity, launch flows
  lib/            env, auth, launch (plan/approval/seal/execute), chain, telegram, api/tools, brain
  proxy.ts        default-deny gate (Next 16 proxy)
cli/              command-line vanity grinder (rakaza-grind.mjs) + core
scripts/          telegram-poll.mjs (local Telegram polling)
public/           avatar, brand assets
tests/            devnet flows, simulators, audits, e2e
docs/             DEPLOY.md, ENV.md, AI-SETUP-GUIDE.txt, LINKS-AND-TOOLS.txt, BUILD-HISTORY-AND-PROMPT.txt, images/
vercel.json       daily cron
```

## Scripts and tests

| Command | What |
|---|---|
| `npm run dev` | Dev server on :3200 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | typecheck + lint + build |
| `npm run grind -- --help` | CLI vanity grinder |
| `npx tsx tests/tools.test.ts` | Agent tool tests |
| `TELEGRAM_MOCK=1 npx tsx tests/telegram-sim.ts` | Telegram bot simulation (no real sends) |
| `npx tsx tests/treasury-clash.ts` | Treasury-clash guard, 70/30 split, `70%%` label regression, Launch Kit counts |
| `npx tsx tests/service-fee.ts` | Self-launch service fee: quote maths, fallback, clamps, expiry, signed-transaction verification |
| `node tests/sponsored-e2e.mjs <feeWallet> --launch` | Real devnet sponsored launch through the /launch UI (owner preview), checks the 70/30 split and that no self-launch text is on the page |
| `node tests/self-launch-e2e.mjs 0.01` | Real devnet self launch through the /self-launch UI with a fake wallet (devnet throwaway key, see `tests/devnet-throwaway.ts`) |
| `npx tsx tests/devnet-fee-flow.ts` | Real devnet launch + fee-split flow (needs devnet keys) |
| `node tests/mobile-audit.mjs` | 390px overflow audit of every tab |

## FAQ and troubleshooting

**Does it need keys to deploy?** No. It builds and serves public pages with zero env. Owner pages redirect to `/login`, APIs answer 401/503 until you configure them.

**Login says "not configured".** Set `DASHBOARD_PASSWORD` and `SESSION_SECRET` (32+ chars), then redeploy.

**Launch says insufficient SOL / `0x1772`.** The program error `TooMuchSolRequired` on a curve that already traded means the dev buy max-cost is too low for the current price; raise slippage or buy less.

**Env changes do nothing on Vercel.** Redeploy; `NEXT_PUBLIC_*` is build-time.

**Cron fails on Hobby.** Only daily schedules are allowed. Keep `0 6 * * *`.

**Wrong network in my shell.** An exported `NEXT_PUBLIC_SOLANA_NETWORK`/`HELIUS_*` in your shell overrides `.env.local`. Unset it.

More, with the exact fixes: [`docs/AI-SETUP-GUIDE.txt`](docs/AI-SETUP-GUIDE.txt), section "Errors we hit and how we fixed them".

## Make it your own launchpad

1. **Rename**: change the name in `package.json`, `src/components/brand/`, `src/app/layout.tsx` metadata and `public/brand/`.
2. **Branding**: colors live in the CSS variables (`--rk-*`) in `src/app/globals.css`; replace the avatar in `public/avatar/`; edit copy in `src/lib/routes-data.json`.
3. **Fee wallets**: set `TREASURY_PUBKEY` to your wallet; the split constants are in `src/lib/tools/splits.ts` (`PLATFORM_*_BPS`, `SELF_*_BPS`).
4. **Treasury**: use a fresh wallet, keep its key only as a Vercel secret (`TREASURY_PRIVATE_KEY`), never in git.
5. **Links**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`.
6. Deploy, then follow the [mainnet checklist](#devnet-first-then-mainnet).

## Brand kit

<table>
<tr>
<td width="30%"><img src="docs/images/profile.jpg" alt="Profile picture"><br>Profile picture</td>
<td width="70%"><img src="docs/images/twitter-header.jpg" alt="X / Twitter header"><br>X header (3:1)</td>
</tr>
</table>

Style notes and the prompts to regenerate these: [`docs/images/PROMPTS.md`](docs/images/PROMPTS.md).

## Guides for AI agents, links and build history

| File | What |
|---|---|
| [`docs/AI-SETUP-GUIDE.txt`](docs/AI-SETUP-GUIDE.txt) | 0-to-final setup guide for any AI agent, with every command and the errors we hit |
| [`docs/LINKS-AND-TOOLS.txt`](docs/LINKS-AND-TOOLS.txt) | Every link, SDK, repo, skill, MCP and doc used |
| [`docs/BUILD-HISTORY-AND-PROMPT.txt`](docs/BUILD-HISTORY-AND-PROMPT.txt) | How it was built, phase by phase, plus a copy-paste AI build prompt |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) / [`docs/ENV.md`](docs/ENV.md) | Vercel deploy and env reference |

## License

[MIT](LICENSE). Not financial advice. Launching tokens carries risk; you are responsible for compliance in your jurisdiction.
