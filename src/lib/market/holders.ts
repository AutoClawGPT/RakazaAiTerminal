import "server-only";
import { PublicKey } from "@solana/web3.js";
import { curvePda, readConn } from "./curve";
import { shortAddr, type Network } from "./types";

export interface Holder { address: string; amount: number; pct: number; isCurve: boolean }
const cache = new Map<string, { at: number; v: Holder[] }>();

/** Largest token accounts, with the owner wallet shortened. The bonding curve's own balance is flagged. */
export async function topHolders(network: Network, mint: string): Promise<Holder[] | null> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const conn = readConn(network);
  if (!conn) return null;
  try {
    const [largest, supply] = await Promise.all([conn.getTokenLargestAccounts(new PublicKey(mint)), conn.getTokenSupply(new PublicKey(mint))]);
    const total = Number(supply.value.uiAmount ?? 0) || 1_000_000_000;
    const top = largest.value.slice(0, 20);
    const infos = await conn.getMultipleParsedAccounts(top.map((a) => a.address));
    const curve = curvePda(mint).toBase58();
    const v = top.map((a, i) => {
      const parsed = infos.value[i]?.data;
      const owner = parsed && typeof parsed === "object" && "parsed" in parsed ? (parsed.parsed as { info?: { owner?: string } })?.info?.owner ?? "" : "";
      const amount = Number(a.uiAmount ?? 0);
      return { address: owner ? shortAddr(owner) : shortAddr(a.address.toBase58()), amount, pct: Math.round((amount / total) * 10000) / 100, isCurve: owner === curve };
    }).filter((h) => h.amount > 0);
    cache.set(mint, { at: Date.now(), v });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return v;
  } catch { return null; }
}
