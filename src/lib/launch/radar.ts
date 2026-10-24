import "server-only";
import { compareAddresses, type Verdict } from "@/lib/tools/shield";

export interface Lookalike {
  mint: string;
  name: string;
  symbol: string;
  priceUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  ageHours?: number;
  url: string;
  risk: number; // 0-100
  why: string[];
  verdict: Verdict;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** How alike two names are, 0 (nothing) to 1 (identical after cleanup). */
export function similarity(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

interface DexPair {
  chainId?: string; url?: string; baseToken?: { address: string; name: string; symbol: string };
  priceUsd?: string; liquidity?: { usd?: number }; marketCap?: number; fdv?: number; pairCreatedAt?: number;
}

export async function radarScan(input: { mint?: string; name: string; ticker: string }): Promise<{ ok: true; found: Lookalike[]; checked: number } | { ok: false; error: string }> {
  const queries = [...new Set([input.ticker, input.name].map((q) => q.trim()).filter((q) => q.length >= 2))];
  if (!queries.length) return { ok: false, error: "Give a name or ticker to look for." };
  const seen = new Map<string, DexPair>();
  try {
    for (const q of queries) {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!res.ok) return { ok: false, error: `DexScreener answered ${res.status}. Try again in a minute.` };
      const j = (await res.json()) as { pairs?: DexPair[] };
      for (const p of j.pairs ?? []) if (p.chainId === "solana" && p.baseToken && !seen.has(p.baseToken.address)) seen.set(p.baseToken.address, p);
    }
  } catch {
    return { ok: false, error: "Could not reach DexScreener. Try again in a minute." };
  }
  const out: Lookalike[] = [];
  for (const [addr, p] of seen) {
    if (addr === input.mint) continue;
    const b = p.baseToken!;
    const ns = similarity(b.name, input.name), ts = similarity(b.symbol, input.ticker);
    const why: string[] = [];
    let risk = 0;
    if (ts === 1) { risk += 45; why.push("Same ticker"); } else if (ts >= 0.75) { risk += 25; why.push("Very close ticker"); }
    if (ns === 1) { risk += 40; why.push("Same name"); } else if (ns >= 0.75) { risk += 22; why.push("Very close name"); }
    let verdict: Verdict = "different";
    if (input.mint) {
      const c = compareAddresses(input.mint, addr);
      verdict = c.verdict ?? "different";
      if (c.valid && c.verdict && c.verdict !== "different") { risk += 25; why.push("Address looks like yours at the ends"); }
    }
    if (risk < 25) continue;
    const liq = p.liquidity?.usd;
    if ((liq ?? 0) > 20000) risk += 10;
    out.push({ mint: addr, name: b.name, symbol: b.symbol, priceUsd: p.priceUsd ? Number(p.priceUsd) : undefined, liquidityUsd: liq, marketCapUsd: p.marketCap ?? p.fdv, ageHours: p.pairCreatedAt ? Math.max(0, (Date.now() - p.pairCreatedAt) / 36e5) : undefined, url: p.url ?? `https://dexscreener.com/solana/${addr}`, risk: Math.min(100, risk), why, verdict });
  }
  out.sort((a, b) => b.risk - a.risk);
  return { ok: true, found: out.slice(0, 20), checked: seen.size };
}
