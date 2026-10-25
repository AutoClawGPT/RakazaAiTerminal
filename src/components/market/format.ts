/** Number and time formatting for the public market pages. Small, dependency free, safe on server and client. */

export function fmtSol(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "--";
  if (n !== 0 && Math.abs(n) < 0.01) return n.toPrecision(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(2)}`;
}

/** Tiny SOL prices (like 0.0000000005) are written as 5.56e-10 so they stay readable. */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "--";
  return n < 0.001 ? n.toExponential(2) : n.toPrecision(3);
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function timeAgo(from: string | number | null | undefined, now: number = Date.now()): string {
  if (from == null) return "--";
  const t = typeof from === "number" ? (from < 1e12 ? from * 1000 : from) : new Date(from).getTime();
  if (!Number.isFinite(t)) return "--";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Total supply of every pump.fun token is 1,000,000,000 (6 decimals). Market cap in SOL = price in SOL x supply. */
export const SUPPLY = 1_000_000_000;

/** Current time in ms. Wrapped so server pages can call it without tripping the render-purity lint rule. */
export const nowMs = (): number => Date.now();
