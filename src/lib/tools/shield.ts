import { isSolanaAddress } from "./address";

/** Possible values per base58 character. */
export const BASE58 = 58;

export type Grade = "Fortress" | "Solid" | "Cloneable" | "Wide open";

export interface Attacker {
  name: string;
  rate: number; // keys per second
}
export const ATTACKERS: Attacker[] = [
  { name: "Laptop", rate: 1e4 },
  { name: "One GPU", rate: 3e7 },
  { name: "GPU farm", rate: 2e9 },
];

/** Expected number of keys to match `n` characters at each end. */
export const keysFor = (n: number) => Math.pow(BASE58, 2 * n);

export function shieldScore(n: number): { score: number; grade: Grade; keys: number } {
  const keys = keysFor(n);
  const score = Math.max(0, Math.min(100, Math.round(((Math.log10(keys) - 4) / 14) * 100)));
  const grade: Grade = score >= 85 ? "Fortress" : score >= 65 ? "Solid" : score >= 40 ? "Cloneable" : "Wide open";
  return { score, grade, keys };
}

export function attackerTimes(n: number) {
  const keys = keysFor(n);
  return ATTACKERS.map((a) => ({ ...a, seconds: keys / a.rate }));
}

export function humanTime(seconds: number): string {
  if (seconds < 1) return "instant";
  const units: [string, number][] = [
    ["year", 31_557_600],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const v = seconds / size;
      if (name === "year" && v >= 1e6) return `${v.toExponential(1)} years`;
      const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
      return `${r.toLocaleString("en-US")} ${name}${r === 1 ? "" : "s"}`;
    }
  }
  return "instant";
}

const CONFUSABLE = new Set(["0O", "O0", "Il", "lI", "1l", "l1"]);

export type Verdict = "same" | "poisoning" | "vamp" | "likely" | "suspicious" | "different";
export interface Comparison {
  valid: boolean;
  error?: string;
  verdict?: Verdict;
  message?: string;
  severity?: "bad" | "warn" | "ok";
  head: number;
  tail: number;
  total: number;
  cost: number;
  confusables: { index: number; a: string; b: string }[];
}

export function compareAddresses(real: string, other: string): Comparison {
  const a = real.trim();
  const b = other.trim();
  const base = { head: 0, tail: 0, total: 0, cost: 1, confusables: [] as Comparison["confusables"] };
  if (!isSolanaAddress(a) || !isSolanaAddress(b)) return { ...base, valid: false, error: "Both must be valid Solana addresses." };
  if (a === b) return { ...base, valid: true, verdict: "same", message: "These are the same address.", severity: "ok" };
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const total = head + tail;
  const confusables: Comparison["confusables"] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i] && CONFUSABLE.has(a[i] + b[i])) confusables.push({ index: i, a: a[i], b: b[i] });
  }
  const [verdict, message, severity] =
    total >= 14
      ? (["poisoning", "Address-poisoning copy: it differs only in the middle.", "bad"] as const)
      : total >= 8
        ? (["vamp", "Deliberate lookalike: ground to resemble yours.", "bad"] as const)
        : total >= 6
          ? (["likely", "Very likely a lookalike.", "bad"] as const)
          : total >= 4
            ? (["suspicious", "Suspicious overlap at the ends.", "warn"] as const)
            : (["different", "Different address.", "ok"] as const);
  return { valid: true, verdict, message, severity, head, tail, total, cost: keysFor(total / 2), confusables };
}
