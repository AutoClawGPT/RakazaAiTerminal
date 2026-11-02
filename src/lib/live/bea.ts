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
