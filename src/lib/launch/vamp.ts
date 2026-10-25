import "server-only";
import { fetchToken, type TokenInfo } from "./token-fetch";
import { radarScan, type Lookalike } from "./radar";
import { shieldScore, attackerTimes, humanTime } from "@/lib/tools/shield";

/** One grindcore-style row: "Likely vamp · TICKER · same ticker · same name · 3+4 matching ends · liq $x · mc $y". */
export function rowText(r: Lookalike): string {
  const money = (n?: number) => (n === undefined ? "n/a" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
  return [r.label, r.symbol, r.sameTicker ? "same ticker" : null, r.sameName ? "same name" : null, r.head + r.tail > 0 ? `${r.head}+${r.tail} matching ends` : null, `liq ${money(r.liquidityUsd)}`, `mc ${money(r.marketCapUsd)}`].filter(Boolean).join(" · ");
}

export interface VampResult {
  mint: string;
  token: Pick<TokenInfo, "name" | "symbol" | "image" | "description" | "marketCapUsd" | "liquidityUsd" | "isPump" | "links">;
  /** Clone-cost of the scanned address itself (Vamp Shield). */
  shield: { endsMatched: number; score: number; grade: string; laptop: string; gpu: string; note: string };
  rows: (Lookalike & { text: string; chart: string })[];
  flagged: number;
  checked: number;
  scannedAt: string;
}

/** Real Vamp Radar + Vamp Shield scan of one token address. Uses DexScreener, Helius and the token's own metadata. */
export async function vampScan(mint: string): Promise<{ ok: true; result: VampResult } | { ok: false; error: string }> {
  const t = await fetchToken(mint);
  if (!t.ok) return t;
  const token = t.token;
  if (!token.name && !token.symbol) return { ok: false, error: "No name or ticker found for that address yet. It may be too new for DexScreener, or it is not a token." };
  const r = await radarScan({ mint: token.mint, name: token.name, ticker: token.symbol });
  if (!r.ok) return r;
  const rows = r.found.map((l) => ({ ...l, text: rowText(l), chart: `https://dexscreener.com/solana/${l.mint}` }));
  // Vamp Shield: how many ends the closest lookalike matches, and what that cost an attacker.
  const ends = rows.reduce((m, x) => Math.max(m, x.head + x.tail), 0);
  const n = Math.floor(ends / 2);
  const sh = shieldScore(n);
  const times = attackerTimes(n);
  return {
    ok: true,
    result: {
      mint: token.mint,
      token: { name: token.name, symbol: token.symbol, image: token.image, description: token.description, marketCapUsd: token.marketCapUsd, liquidityUsd: token.liquidityUsd, isPump: token.isPump, links: token.links },
      shield: { endsMatched: ends, score: sh.score, grade: sh.grade, laptop: humanTime(times[0].seconds), gpu: humanTime(times[1].seconds), note: ends ? `Closest lookalike matches ${ends} end characters.` : "No lookalike address shares your ends." },
      rows,
      flagged: rows.length,
      checked: r.checked,
      scannedAt: new Date().toISOString(),
    },
  };
}
