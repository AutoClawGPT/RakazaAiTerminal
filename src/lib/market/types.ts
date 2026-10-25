export type Network = "devnet" | "mainnet-beta";
export const INTERVALS = { "15s": 15, "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 } as const;
export type Interval = keyof typeof INTERVALS;
export const GRADUATING_PCT = 60;

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface PublicTrade { signature: string; t: number; side: "buy" | "sell"; solAmount: number; tokenAmount: number; priceSol: number; trader: string }

export interface PublicToken {
  mint: string; name: string; symbol: string; description: string; image: string | null;
  network: Network; mode: "agent" | "self"; launchedAt: string;
  links: { website?: string; twitter?: string; telegram?: string; explorer: string; pumpfun: string; page: string };
  curve: { progressPct: number; complete: boolean; graduatingSoon: boolean };
  market: { priceSol: number | null; marketCapSol: number | null; priceUsd: number | null; marketCapUsd: number | null; volume24hSol: number; trades24h: number; lastTradeAt: string | null };
}

/** First 4 and last 4 characters only. Used for every wallet address in the public API. */
export function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
