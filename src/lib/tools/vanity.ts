/** Pure helpers for the browser vanity-address grinder. The grinding itself runs in a Web Worker. */
export const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const MAX_PATTERN = 12;

export interface Pattern {
  start: string;
  end: string;
  ignoreCase: boolean;
}

export function invalidChars(s: string): string[] {
  return [...new Set([...s].filter((c) => !B58_ALPHABET.includes(c)))];
}

export function validatePattern(p: Pattern): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!p.start && !p.end) errors.push("Enter a start, an end, or both.");
  if (p.start.length + p.end.length > MAX_PATTERN) errors.push(`Start and end can use at most ${MAX_PATTERN} characters together.`);
  const bad = invalidChars(p.start + p.end);
  if (bad.length) errors.push(`These characters never appear in addresses: ${bad.join(" ")} (0, O, I and l are left out).`);
  return { ok: errors.length === 0, errors };
}

const other = (c: string) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

/** Chance that one random address matches the pattern. */
export function matchProbability(p: Pattern): number {
  let prob = 1;
  for (const c of p.start + p.end) {
    const options = p.ignoreCase && other(c) !== c && B58_ALPHABET.includes(other(c)) ? 2 : 1;
    prob *= options / 58;
  }
  return prob;
}

export const expectedKeys = (p: Pattern) => 1 / matchProbability(p);

export function matcher(p: Pattern): (addr: string) => boolean {
  const norm = (s: string) => (p.ignoreCase ? s.toLowerCase() : s);
  const s = norm(p.start);
  const e = norm(p.end);
  return (addr) => {
    const a = norm(addr);
    return a.startsWith(s) && a.endsWith(e);
  };
}

/** How many leading and trailing characters match, as a fraction of the pattern (for "closest so far"). */
export function closeness(p: Pattern, addr: string): number {
  const norm = (s: string) => (p.ignoreCase ? s.toLowerCase() : s);
  const a = norm(addr);
  const s = norm(p.start);
  const e = norm(p.end);
  let h = 0;
  while (h < s.length && a[h] === s[h]) h++;
  let t = 0;
  while (t < e.length && a[a.length - 1 - t] === e[e.length - 1 - t]) t++;
  const total = s.length + e.length;
  return total ? (h + t) / total : 0;
}

export type Tier = "Instant" | "Easy" | "Medium" | "Hard" | "GPU only";
export function tierFor(seconds: number): Tier {
  return seconds < 10 ? "Instant" : seconds < 600 ? "Easy" : seconds < 6 * 3600 ? "Medium" : seconds < 14 * 86400 ? "Hard" : "GPU only";
}

export type WorkerIn = { type: "start"; pattern: Pattern } | { type: "stop" };
export type WorkerOut =
  | { type: "ready" }
  | { type: "progress"; count: number; best: { addr: string; score: number } | null }
  | { type: "found"; addr: string; secret: string; count: number }
  | { type: "error"; message: string };
