// Pattern helpers for the Rakaza vanity grinder. Original code, no dependencies.
export const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const MAX_PATTERN_CHARS = 12;
/** In a pattern, "?" matches any one base58 character. */
export const WILDCARD = "?";

const swap = (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

/** Returns a list of problems (empty list means the pattern is usable). */
export function validatePattern(p) {
  const errors = [];
  const start = p.start ?? "", end = p.end ?? "";
  if (!start && !end) errors.push("Give a start, an end, or both.");
  if (start.length + end.length > MAX_PATTERN_CHARS) errors.push(`Start and end can use at most ${MAX_PATTERN_CHARS} characters together.`);
  const bad = [...new Set([...(start + end)].filter((c) => c !== WILDCARD && !B58.includes(c)))];
  if (bad.length) errors.push(`These characters never appear in a Solana address: ${bad.join(" ")} (0, O, I and l are left out).`);
  return errors;
}

/** Chance that one random address matches the pattern. */
export function matchProbability(p) {
  let prob = 1;
  for (const c of (p.start ?? "") + (p.end ?? "")) {
    if (c === WILDCARD) continue;
    const both = p.caseSensitive === false && swap(c) !== c && B58.includes(swap(c));
    prob *= (both ? 2 : 1) / 58;
  }
  return prob;
}

/** Average number of keys you must try before one matches any of the patterns. */
export function expectedKeys(patterns) {
  const total = patterns.reduce((a, p) => a + matchProbability(p), 0);
  return total > 0 ? 1 / total : Infinity;
}

/** Fast matcher: compiles each pattern once and returns (addr) => index of first pattern that matches, or -1. */
export function compile(patterns) {
  const prepared = patterns.map((p) => {
    const ci = p.caseSensitive === false;
    const n = (s) => (ci ? s.toLowerCase() : s);
    return { s: n(p.start ?? ""), e: n(p.end ?? ""), ci };
  });
  const fits = (str, pat, atEnd) => {
    if (pat.length > str.length) return false;
    const off = atEnd ? str.length - pat.length : 0;
    for (let i = 0; i < pat.length; i++) if (pat[i] !== WILDCARD && pat[i] !== str[off + i]) return false;
    return true;
  };
  return (addr) => {
    for (let i = 0; i < prepared.length; i++) {
      const q = prepared[i];
      const a = q.ci ? addr.toLowerCase() : addr;
      if (fits(a, q.s, false) && fits(a, q.e, true)) return i;
    }
    return -1;
  };
}

export function humanDuration(seconds) {
  if (!Number.isFinite(seconds)) return "never";
  if (seconds < 1) return "instant";
  const u = [["year", 31557600], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [n, s] of u) if (seconds >= s) { const v = Math.round((seconds / s) * 10) / 10; return `${v} ${n}${v === 1 ? "" : "s"}`; }
  return "instant";
}
