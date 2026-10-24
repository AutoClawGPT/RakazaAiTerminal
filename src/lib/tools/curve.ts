/**
 * Constant-product bonding-curve model for the Launch Lab.
 * Defaults are pump.fun's published initial curve; the Lab lets the owner override them
 * (and Phase 4 reads the live values from the pump SDK). Results are estimates.
 */
export interface CurveParams {
  totalSupply: number;
  virtualTokens: number;
  virtualSol: number;
  sellable: number;
  fee: number; // fraction taken from each buy
}

export const PUMP_DEFAULTS: CurveParams = {
  totalSupply: 1_000_000_000,
  virtualTokens: 1_073_000_000,
  virtualSol: 30,
  sellable: 793_100_000,
  fee: 0.01,
};

export interface BuyRow {
  wallet: string;
  sol: number;
  tokens: number;
  pct: number; // share of total supply
  avgPrice: number; // SOL per token
}

export interface SimResult {
  rows: BuyRow[];
  sold: number;
  raised: number;
  price: number;
  marketCapSol: number;
  marketCapUsd: number;
  progress: number;
  startMcSol: number;
  graduated: boolean;
  devPct: number;
  extraPct: number;
  warnings: { level: "bad" | "warn"; text: string }[];
}

export function simulate(buys: { wallet: string; sol: number }[], solUsd = 150, p: CurveParams = PUMP_DEFAULTS): SimResult {
  const k = p.virtualTokens * p.virtualSol;
  let sold = 0;
  const rows: BuyRow[] = [];
  for (const b of buys) {
    const sol = Math.max(0, Number.isFinite(b.sol) ? b.sol : 0);
    const net = sol * (1 - p.fee);
    const vt = p.virtualTokens - sold;
    const vs = k / vt;
    let tokens = vt - k / (vs + net);
    tokens = Math.max(0, Math.min(tokens, p.sellable - sold));
    sold += tokens;
    rows.push({ wallet: b.wallet, sol, tokens, pct: (tokens / p.totalSupply) * 100, avgPrice: tokens > 0 ? net / tokens : 0 });
  }
  const vt = p.virtualTokens - sold;
  const vs = k / vt;
  const price = vs / vt;
  const startMcSol = (p.virtualSol / p.virtualTokens) * p.totalSupply;
  const marketCapSol = price * p.totalSupply;
  const graduated = sold >= p.sellable - 1;
  const devPct = rows[0]?.pct ?? 0;
  const extraPct = rows.slice(1).reduce((s, r) => s + r.pct, 0);
  const warnings: SimResult["warnings"] = [];
  if (devPct > 10) warnings.push({ level: "bad", text: `Dev holds ${devPct.toFixed(1)}% of supply. Buyers read that as a risk.` });
  else if (devPct > 5) warnings.push({ level: "warn", text: `Dev holds ${devPct.toFixed(1)}% of supply. Keep it modest.` });
  if (extraPct > 15) warnings.push({ level: "bad", text: `Extra wallets hold ${extraPct.toFixed(1)}% combined. If they link back to you, that is a bundle.` });
  if (graduated) warnings.push({ level: "warn", text: "This buy size graduates the curve at once: liquidity moves to the AMM." });
  return {
    rows,
    sold,
    raised: vs - p.virtualSol,
    price,
    marketCapSol,
    marketCapUsd: marketCapSol * solUsd,
    progress: Math.min(1, sold / p.sellable),
    startMcSol,
    graduated,
    devPct,
    extraPct,
    warnings,
  };
}

export const LAB_PRESETS: { name: string; dev: number; wallets: number[] }[] = [
  { name: "Stealth · 0.5 SOL", dev: 0.5, wallets: [] },
  { name: "Conviction · 3 SOL", dev: 3, wallets: [] },
  { name: "Bundled team", dev: 1.5, wallets: [1, 1, 1, 1] },
  { name: "Whale snipe", dev: 1, wallets: [10, 5] },
  { name: "Graduate it", dev: 2, wallets: [20, 30, 40] },
];
