import "server-only";
import { getEnv } from "./env";
import { publicEnv } from "./public-env";

function rpcUrl() {
  const e = getEnv();
  return publicEnv.network === "mainnet-beta" ? e.HELIUS_MAINNET : e.HELIUS_DEVNET ?? e.HELIUS_MAINNET;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const url = rpcUrl();
  if (!url) return null;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(10000) });
    const j = (await r.json()) as { result?: T };
    return j.result ?? null;
  } catch { return null; }
}

/** Public balance read for an address (no keys involved). */
export async function solBalance(pubkey: string): Promise<number | null> {
  const r = await rpc<{ value: number }>("getBalance", [pubkey]);
  return r ? r.value / 1e9 : null;
}

export async function rpcHealth(): Promise<{ ok: boolean; ms: number; slot?: number }> {
  const t = Date.now();
  const slot = await rpc<number>("getSlot", []);
  return { ok: slot != null, ms: Date.now() - t, slot: slot ?? undefined };
}
