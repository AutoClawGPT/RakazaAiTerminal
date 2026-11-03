import "server-only";
/** Project BEA (owner's EC2) proxy helpers. The token stays server-side; nothing secret reaches the browser. */
export function beaConfig(): { url: string; token: string } | null {
  const url = process.env.BEA_URL?.trim().replace(/\/$/, "");
  const token = process.env.BEA_PROXY_TOKEN?.trim();
  return url && token ? { url, token } : null;
}
export function beaFetch(path: string, init: RequestInit = {}) {
  const c = beaConfig();
  if (!c) throw new Error("BEA not configured");
  return fetch(`${c.url}${path}`, { ...init, cache: "no-store", headers: { ...(init.headers as Record<string, string>), "X-Rakaza-Token": c.token } });
}

/** Cached (15 s) reachability check so /live can fall back to the offline view when the EC2 is down. */
const g = globalThis as unknown as { __beaUp?: { at: number; up: boolean } };
export async function beaUp(): Promise<boolean> {
  if (!beaConfig()) return false;
  const c = g.__beaUp;
  if (c && Date.now() - c.at < 15000) return c.up;
  const up = await beaFetch("/stage", { signal: AbortSignal.timeout(4000) }).then((r) => { void r.body?.cancel(); return r.ok; }).catch(() => false);
  g.__beaUp = { at: Date.now(), up };
  return up;
}
