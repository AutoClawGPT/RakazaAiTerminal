# Phase 9 readiness: verification log (2026-10-25, Europe/Skopje)

Phase: 9, deploy readiness. Network: devnet. No push, no deploy, no mainnet transaction was made.

| Criterion | Command / method | Result |
|---|---|---|
| Studio landing is real, links to create and learn, shows generator entry | headless Chrome 390px and 1280px on `/studio`, `/studio/learn` | HTTP 200, 0 px horizontal overflow, 0 console errors |
| Generation stays owner-only | `EXPECT_OWNER=0 node tests/studio-e2e.mjs` against a production build | "Owner sign-in required.", PASS |
| Owner generation still works | `node tests/studio-e2e.mjs` on dev | PASS |
| `vercel.json` valid | validated against `https://openapi.vercel.sh/vercel.json` with Ajv; a bad file was rejected (negative control) | valid |
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint .` | exit 0, 0 errors, 1 pre-existing warning (`logout-button.tsx`) |
| Production build from committed files only | fresh `git clone`, `npm ci`, `next build`, Node 22.23, `env -i` with 6 test variables | exit 0, 73 route entries, no errors |
| Smoke test, `next start -p 3300`, no keys configured | curl on every built route | public pages 200; owner pages 307 to `/login`; `/design` 404 (dev-only by design); `/api/*` and `/mcp` without credentials 401; POST-only routes 405 on GET; 0 unexpected 404 or 500 |
| Owner session | login with the test password, then every owner page | 200 on all 25 |
| API with owner bearer | `/api/v1/tools`, `platform_info`, `/mcp initialize` | 200 |
| Cron | no bearer 401, wrong bearer 401, `CRON_SECRET` bearer 503 (execution off) | as designed |
| Tools audit | `node tests/tools-audit.mjs` (dev server) | 24/24 pass |
| Secret scan, working tree and all 52 commits | 15 token patterns, plus every value in `.env.local` (31 values, compared, never printed) | 0 hits |
| Sensitive file names ever committed | `git log --all --name-only` filtered for env, keypair, wallet, pem, key | only `.env.example` and `src/lib/keys/secret-store.ts` (source code) |
| Tracked files over 5 MB | `stat` over `git ls-files` | none. Largest: `public/avatar/sample_b.vrm` 4.0 MB |
| VRM redistribution | read the embedded VRM metadata and `public/avatar/LICENSE.md` | author VRoid Project, commercial use allowed, license URL says `redistribution=allow`, `credit=unnecessary` |
| `package.json` | name `rakaza-tokenization`, version `0.1.0`, private, engines `22.x` | confirmed |

Not changed on purpose: `robots.txt` still disallows everything, `/api/health` still reports `"phase":1`, and the `/design` page is still dev-only.

Known and harmless on Vercel: the build prints "bigint: Failed to load bindings, pure JS will be used" (optional native add-on skipped, the JS fallback is used).
