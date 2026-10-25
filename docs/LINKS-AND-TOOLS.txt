RAKAZA AI TERMINAL - LINKS, TOOLS, REPOS, SDKs, SKILLS, MCPs AND DOCS
=====================================================================
Every link below was used to build or verify this project. One line each: what it is for.
No secrets are in this file. Companion files: README.md, docs/AI-SETUP-GUIDE.txt, docs/BUILD-HISTORY-AND-PROMPT.txt

----------------------------------------------------------------------
1. REFERENCE SITES (given by the owner; used as design/behaviour references, never copied)
----------------------------------------------------------------------
https://www.agi1.app/                        MAIN reference: AI-character site (chrome, tabs, evaluations, model card, playground, diary, memes, studio)
https://www.agi1.app/live                    Live stream question queue (reference for /live)
https://www.agi1.app/#model-card             Model card section pattern
https://www.agi1.app/#playground             Playground section pattern
https://www.grindcore.fun/                   Browser vanity-address grinder. Tabs used as reference:
   #/shield  #/lab  #/kit  #/pool  #/splits  #/vault  #/dev      (-> our Shield, Lab, Kit, Pool, Splits, Vault, Dev tabs)
https://heyclawlaunch.vercel.app/            Agent launchpad. Reference for agent flow: /launch  /docs  /skill  and its /mcp + /api/v1/tools design
https://otcdesks.cash/docs                   Fee-share launch docs: measured the tx-size limit (create + 2 fee ixs ~1280 bytes > 1232) -> two/three tx design, on-chain split verification

----------------------------------------------------------------------
2. PUMP.FUN / PUMPPORTAL
----------------------------------------------------------------------
https://pumpportal.fun/creation/             Token creation via API (reference; local create cannot set fee sharing)
https://pumpportal.fun/trading-api/          Trading API docs (trade-local, 0.5% fee on local trades)
https://pump.fun/docs                        pump.fun docs
https://github.com/pump-fun/pump-public-docs Public pump docs and IDLs: COIN_CREATION.md, CREATOR_FEE_SHARING.md (the source of the fee-share rules)
https://www.npmjs.com/package/@pump-fun/pump-sdk   @pump-fun/pump-sdk 4.3.1 (pinned). The GitHub repo is private; we read the npm tarball
https://github.com/pump-fun/pump-fun-skills  Agent skills (tokenized-agents/SKILL.md) for pump.fun
https://github.com/pump-fun/pump-fun-skills/blob/main/tokenized-agents/SKILL.md   Tokenized agents skill
https://mcp.pump.fun/mcp                     pump.fun MCP server (reference; not connected)

----------------------------------------------------------------------
3. SOLANA
----------------------------------------------------------------------
https://solana.com/docs                      Solana docs
https://solana.com/docs/intro/coding-with-agents   Coding with agents guide
https://solana.com/skills                    Official Solana skills directory
https://github.com/solana-foundation/solana-dev-skill   solana-dev skill (installed)
https://www.npmjs.com/package/@solana/web3.js   v1.99.0 pinned. pump-sdk needs the 1.x line, NOT v3
https://github.com/sendaifun/solana-agent-kit   Solana Agent Kit (reference for agent tools)
https://docs.sendai.fun/docs/v2/introduction    SendAI Agent Kit v2 docs
https://docs.sendai.fun/docs/v2/adapters/mcp/mcp-adapter-intro   SendAI MCP adapter (reference for /mcp)
https://github.com/Clawpump/ClawpumpSDK         Clawpump SDK (reference)
https://clawpump.tech/docs                      Clawpump docs
https://www.saidprotocol.com/docs               SAID protocol docs (agent identity, reference)

----------------------------------------------------------------------
4. PROVIDERS WE USE (get an API key at each; see README env table)
----------------------------------------------------------------------
https://www.helius.dev/ , https://docs.helius.dev/    Solana RPC + DAS (HELIUS_DEVNET / HELIUS_MAINNET)
https://portal.jup.ag/ , https://dev.jup.ag/          Jupiter prices/quotes (JUPITER_API_KEY, publishable key for browser)
https://www.solanatracker.io/                          Holders, bundlers, snipers (SOLANATRACKER_API_KEY)
https://www.pimlico.io/                                Secondary Solana RPC / sponsorship (PIMLICO_API_KEY)
https://pinata.cloud/ , https://docs.pinata.cloud/     IPFS pinning, v3 uploads API (PINATA_*)
https://upstash.com/ , https://upstash.com/docs/redis  Redis REST + ratelimit (UPSTASH_*)
https://neon.tech/ , https://neon.tech/docs            Serverless Postgres (DATABASE_URL)
https://deepgram.com/ , https://developers.deepgram.com/   Speech-to-text and Aura-2 text-to-speech (DEEPGRAM_API_KEY; default voice aura-2-luna-en)
River AI (OpenAI-compatible endpoint, RIVER_BASE_URL)  The chat "brain": operator agent key + public persona key
https://gen.pollinations.ai/docs                       Pollinations image API, FLUX Schnell (POLLINATIONS_API_KEY)
https://brave.com/search/api/                          Brave Search API (BRAVE_SEARCH_API_KEY)
https://www.firecrawl.dev/ , https://docs.firecrawl.dev/   Scrape/crawl API + CLI (FIRECRAWL_API_KEY; used heavily for research)
https://upcloud.com/ , https://developers.upcloud.com/     Server status API (UPCLOUD_API_TOKEN, read-only /infra)
https://dexscreener.com/ , https://docs.dexscreener.com/   Lookalike radar (public API, 60 req/min)
https://vercel.com/ , https://vercel.com/docs              Hosting. See section 6
https://t.me/BotFather                                     Create the Telegram bot
https://t.me/userinfobot                                   Find your numeric Telegram id

----------------------------------------------------------------------
5. FRAMEWORKS AND LIBRARIES (package.json)
----------------------------------------------------------------------
https://nextjs.org/docs                      Next.js 16 App Router, proxy.ts (replaces middleware), Turbopack
https://react.dev/                           React 19
https://tailwindcss.com/ , https://ui.shadcn.com/   Tailwind 4 + shadcn primitives
https://zod.dev/                             zod 4 env validation
https://threejs.org/ , https://r3f.docs.pmnd.rs/ , https://github.com/pixiv/three-vrm   3D avatar (three, react-three-fiber, drei, three-vrm)
https://github.com/jedisct1/libsodium.js     libsodium WASM: ed25519 vanity grinding in Web Workers
https://www.coral.xyz/docs                   Anchor 0.31.1 (pump IDL decoding)
https://github.com/anza-xyz/wallet-adapter   Wallet adapter (self-launch signing)
https://github.com/modelcontextprotocol/typescript-sdk   MCP TypeScript SDK (/mcp Streamable HTTP)
https://github.com/puppeteer/puppeteer , https://playwright.dev/   Headless browser tests and screenshots

----------------------------------------------------------------------
6. VERCEL AND GITHUB DOCS READ BEFORE DEPLOY
----------------------------------------------------------------------
https://vercel.com/docs/git                         Git deployments
https://vercel.com/docs/frameworks/nextjs           Next.js on Vercel
https://vercel.com/docs/builds/configure-a-build    Build/install commands, root directory
https://vercel.com/docs/functions/runtimes/node-js  Node versions (22.x pinned in package.json engines)
https://vercel.com/docs/environment-variables       Env vars (64 KB limit, NEXT_PUBLIC_ inlined at build)
https://vercel.com/docs/functions/configuring-functions/duration   maxDuration (Hobby max 300 s)
https://vercel.com/docs/cron-jobs/usage-and-pricing Hobby cron: daily only
https://vercel.com/docs/project-configuration/vercel-json   vercel.json schema (https://openapi.vercel.sh/vercel.json)
https://vercel.com/docs/deployment-protection       Standard protection leaves production domains public
https://vercel.com/docs/projects/overview#ignored-files-and-folders   .vercelignore / auto-ignored files
https://vercel.com/docs/rest-api                    REST API (projects v11, env v10, deployments v13)
https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories   Repo creation
https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github   100 MB file limit
https://docs.github.com/en/code-security/secret-scanning   Secret scanning and push protection

----------------------------------------------------------------------
7. AGENT SKILLS USED (installed with: npx skills add <repo> -s <name> -g -y --copy -> ~/.agents/skills)
----------------------------------------------------------------------
Process: phase-gate, using-agent-skills, verification-before-completion, wallet-approval-gate, subagent-orchestration
Design: frontend-design (anthropics/skills, pbakaus/impeccable), web-design-guidelines + vercel-react-best-practices + vercel-composition-patterns (vercel-labs/agent-skills), shadcn (shadcn-ui/ui), ui-ux-pro-max, design-taste-frontend, accessibility
3D: react-three-fiber, threejs-*, vroid, vrm-mtoon-outline, web3d-integration-patterns
Voice: deepgram-* (14 skills, deepgram/skills)
Solana: solana-dev, svm, helius*, jup-* (jup-ag/agent-skills), pumpfun-* (pump-fun/pump-fun-skills), meteora, dexscreener-api
Infra: pinata-api, upstash-redis-js, upstash-ratelimit-js, neon-postgres, security-and-hardening
Testing: playwright-cli, playwright-best-practices, webapp-testing, agent-browser, vitest
Research: firecrawl-* (cli, scrape, crawl, map, search, interact)
Agent/MCP: mcp-builder, mcp-server-patterns
Full table: research/SKILLS-USED.md in the original workspace (107 skill dirs).

----------------------------------------------------------------------
8. REFERENCE REPOS CLONED (shallow, read-only, never used as a code base)
----------------------------------------------------------------------
Open-LLM-VTuber/Open-LLM-VTuber (+ -Web), Yun-0000/Anima, rehan-remade/open-annie    avatar chat patterns
anthropics/skills, vercel-labs/agent-skills, shadcn-ui/ui, deepgram/skills, deepgram-starters/nextjs-live-transcription
anza-xyz/wallet-adapter, solana-foundation/framework-kit, solana-foundation/kora, solana-foundation/solana-dev-skill, solana-labs/solana-web3.js
pump-fun/pump-fun-skills, pump-fun/pump-public-docs, nirholas/pumpfun-mcp
helius-labs/core-ai, jup-ag/agent-skills, upstash/ratelimit-js, firecrawl/cli
mrdoob/three.js, pmndrs/react-three-fiber, pmndrs/drei, pixiv/three-vrm, jedisct1/libsodium.js
modelcontextprotocol/typescript-sdk, vercel/next.js, vercel/vercel-plugin, microsoft/playwright, vitest-dev/vitest, tailwindlabs/tailwindcss, phaserjs/phaser, x402-foundation/x402, drizzle-team/drizzle-orm, framer/motion

----------------------------------------------------------------------
9. MCP SERVERS / PLUGINS
----------------------------------------------------------------------
Solana MCP (docs search + expert)        Used for Anchor/Solana questions
GitHub (gh CLI + connector)              Repo operations
https://mcp.pump.fun/mcp                 pump.fun MCP (reference)
shadcn MCP: npx shadcn@latest mcp init   Optional
This project's own MCP: /mcp (Streamable HTTP, bearer key) and /api/v1/tools, plus /skill.md for self-onboarding.

----------------------------------------------------------------------
10. RESEARCH FILES (original workspace research/ folder; summarized in BUILD-HISTORY-AND-PROMPT.txt)
----------------------------------------------------------------------
BUILD-PLAN.md, RESEARCH-SUMMARY.md, ENV-VARS.md, STACK-AND-TOOLS.md, TOOLS-INSTALLED.md, SKILLS-USED.md, CRAWL-INDEX.md,
VERCEL-GIT-CHECKLIST.md, MISSING-KEYS.md, TABS.md, TABS-EXACT.md, MASTER-TAB-LIST.md, TAB-SPEC.md,
agi1/AGI1-TEARDOWN.md, agi1/REPRODUCTION-PLAN.md, agents-docs/, crawl/ (Vercel 50 pages, git docs 13 pages), refs/ (37 cloned repos)
The raw crawl dumps are not in this repo (size, and they can contain third-party headers). Everything needed is distilled here.

----------------------------------------------------------------------
11. DOCS INSIDE THIS REPO
----------------------------------------------------------------------
README.md                     Overview, tabs, setup, env table, deploy
docs/DEPLOY.md                Vercel settings, env, cron, domain, mainnet checklist, verification checklist
docs/ENV.md                   Env reference
docs/reviews/phase9-readiness.md   Verification log (build, smoke test, secret scan)
docs/AI-SETUP-GUIDE.txt       0-to-final guide for AI agents
docs/BUILD-HISTORY-AND-PROMPT.txt  Full story + copy-paste build prompt
docs/images/PROMPTS.md        Brand image style
AGENTS.md                     Rules for coding agents working in this repo

----------------------------------------------------------------------
12. TOOLS INSTALLED FOR THE VERCEL PUSH (installed on the build box, then used for the deploy)
----------------------------------------------------------------------
Vercel CLI 65.x          npm i vercel@latest (local dir). Token comes ONLY from the VERCEL_TOKEN env var, never a --token flag, never a file in the repo.
skill: deploy-to-vercel         npx skills add vercel-labs/agent-skills -s deploy-to-vercel -g -y --copy   (deploy flow: link, deploy, inspect)
skill: vercel-cli-with-tokens   npx skills add vercel-labs/agent-skills -s vercel-cli-with-tokens -g -y --copy   (token-only CLI usage, no interactive login)
skill: vercel-optimize, vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions   (vercel-labs/agent-skills, installed earlier)
gh CLI                   GitHub repo operations (push of main only)
Node 22.x                pinned in package.json engines; used for the clean-clone keyless build
Not installed: a Vercel MCP/plugin (needs the owner to authenticate it); the CLI and REST API cover everything required.
