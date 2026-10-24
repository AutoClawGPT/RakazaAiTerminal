import { isSolanaAddress } from "./address";

export const MAX_SHAREHOLDERS = 10;
export const TOTAL_BPS = 10_000;

export interface Shareholder {
  address: string;
  shareBps: number;
  label?: string;
}

export interface SplitCheck {
  ok: boolean;
  errors: string[];
  totalBps: number;
}

/** Validates a pump.fun fee-sharing list: 1..10 unique valid wallets, integer bps > 0 summing to 10000. */
export function validateSplit(rows: Shareholder[]): SplitCheck {
  const errors: string[] = [];
  if (rows.length === 0) errors.push("Add at least one shareholder.");
  if (rows.length > MAX_SHAREHOLDERS) errors.push(`At most ${MAX_SHAREHOLDERS} shareholders are allowed.`);
  const seen = new Set<string>();
  let total = 0;
  rows.forEach((r, i) => {
    const n = i + 1;
    const addr = r.address.trim();
    if (!isSolanaAddress(addr)) errors.push(`Row ${n}: not a valid Solana address.`);
    else if (seen.has(addr)) errors.push(`Row ${n}: duplicate address.`);
    seen.add(addr);
    if (!Number.isInteger(r.shareBps) || r.shareBps <= 0) errors.push(`Row ${n}: share must be a whole number of basis points above 0.`);
    else total += r.shareBps;
  });
  if (total !== TOTAL_BPS) errors.push(`Shares add up to ${total} bps, they must add up to ${TOTAL_BPS} (100%).`);
  return { ok: errors.length === 0, errors, totalBps: total };
}

/** Splits 10000 bps evenly across `n` rows. The remainder goes to the first rows, one bp each. */
export function splitEvenly(n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SHAREHOLDERS) throw new RangeError("n must be 1..10");
  const base = Math.floor(TOTAL_BPS / n);
  const rem = TOTAL_BPS - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** The permanent platform default: 70% launcher, 30% treasury. */
export const PLATFORM_LAUNCHER_BPS = 7000;
export const PLATFORM_TREASURY_BPS = 3000;

export function platformSplit(launcher: string, treasury: string): Shareholder[] {
  return [
    { address: launcher.trim(), shareBps: PLATFORM_LAUNCHER_BPS, label: "Launcher" },
    { address: treasury.trim(), shareBps: PLATFORM_TREASURY_BPS, label: "Platform treasury" },
  ];
}

export function exportSplit(mint: string, rows: Shareholder[]): string {
  return JSON.stringify(
    { mint, shareholders: rows.map((r) => ({ address: r.address.trim(), shareBps: r.shareBps, ...(r.label ? { label: r.label } : {}) })) },
    null,
    2,
  );
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
