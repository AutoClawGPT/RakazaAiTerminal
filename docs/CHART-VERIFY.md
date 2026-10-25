# Live chart verification (read-only)

Checked Oct 25 2026 (Europe/Skopje). No mainnet transaction was sent; mainnet was only read.

**Mainnet (read only)** `tests/chart-mainnet-live.ts`, live pump.fun mint `4za3s1LwdU5TUuWvEEeXSATazfAMTdw3Fv6McxBRpump`:
- DexScreener pair found (dex `pumpfun`), price and market cap returned.
- GeckoTerminal OHLCV: 17 x 1m, 5 x 5m, 1 x 1h candles; last 1m candle about 2.5 minutes old.
- On-chain bonding curve read through the RPC: progress 70.88 %, not complete, price and market cap in SOL.
- Run it with `MINT=<mint> NODE_OPTIONS="-r tests/stub-so.cjs" npx tsx tests/chart-mainnet-live.ts` (app env needed for the RPC url).

**Devnet** token `FaGN6PtWJ7R24cc5WpYiQvYNfPZZCKxyn9CK3tcSD5jg`: a real 0.01 SOL buy by a throwaway wallet (`tests/devnet-agent-e2e.ts`) showed up in `/api/public/tokens/<mint>/candles` (15s, 1m, 5m, source `rakaza-index`) about 30 seconds later and in `/trades`. The chart component polls every 3 seconds while the tab is visible.

Note: the public candles route serves tokens Rakaza launched or indexed. An arbitrary mainnet mint is read through the same DexScreener/GeckoTerminal/curve helpers once it is in the index.
