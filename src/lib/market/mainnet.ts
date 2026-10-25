import "server-only";
import { INTERVALS, type Candle, type Interval } from "./types";

async function getJson<T>(url: string, ms = 7000): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" }, next: { revalidate: 15 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

export interface DexMarket { pair: string; dex: string; priceUsd: number | null; priceSol: number | null; marketCapUsd: number | null; volume24hUsd: number | null; liquidityUsd: number | null; image?: string }

interface DexPair { chainId?: string; dexId?: string; pairAddress?: string; baseToken?: { address?: string }; quoteToken?: { symbol?: string }; priceNative?: string; priceUsd?: string; marketCap?: number; fdv?: number; volume?: { h24?: number }; liquidity?: { usd?: number }; info?: { imageUrl?: string } }

/** Best Solana pair for a mint on DexScreener (most liquid). Null when it has none. */
export async function dexMarket(mint: string): Promise<DexMarket | null> {
  const j = await getJson<{ pairs?: DexPair[] }>(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`);
  const p = (j?.pairs ?? []).filter((x) => x.chainId === "solana" && x.baseToken?.address === mint && x.pairAddress).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!p || !p.pairAddress) return null;
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  return { pair: p.pairAddress, dex: p.dexId ?? "", priceUsd: num(p.priceUsd), priceSol: p.quoteToken?.symbol === "SOL" ? num(p.priceNative) : null, marketCapUsd: num(p.marketCap ?? p.fdv), volume24hUsd: num(p.volume?.h24), liquidityUsd: num(p.liquidity?.usd), image: p.info?.imageUrl };
}

const GECKO: Record<Interval, { unit: "minute" | "hour" | "day"; agg: number } | null> = {
  "15s": null, "1m": { unit: "minute", agg: 1 }, "5m": { unit: "minute", agg: 5 }, "15m": { unit: "minute", agg: 15 }, "1h": { unit: "hour", agg: 1 }, "4h": { unit: "hour", agg: 4 }, "1d": { unit: "day", agg: 1 },
};

/** OHLCV from GeckoTerminal for a mainnet pool, priced in the pool's quote token (SOL for pump pools). Null when unsupported or unavailable. */
export async function geckoCandles(pool: string, interval: Interval, limit: number): Promise<Candle[] | null> {
  const g = GECKO[interval];
  if (!g) return null;
  const j = await getJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${g.unit}?aggregate=${g.agg}&limit=${Math.min(500, Math.max(1, limit))}&currency=token`,
    9000,
  );
  const list = j?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return null;
  const step = INTERVALS[interval];
  return list
    .filter((r) => r.length >= 6 && r.every((x) => Number.isFinite(x)))
    .map((r) => ({ t: Math.floor(r[0] / step) * step, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }))
    .sort((a, b) => a.t - b.t);
}
