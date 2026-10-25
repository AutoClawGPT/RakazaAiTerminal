import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, bondingCurvePda, isBondingCurveMigrated } from "@pump-fun/pump-sdk";
import { getEnv } from "@/lib/env";
import type { Network } from "./types";

export interface CurveState {
  progressPct: number;
  complete: boolean;
  priceSol: number | null;
  marketCapSol: number | null;
}

const conns = new Map<Network, Connection>();
/** Read-only RPC connection. Null when the deployment has no RPC URL for that network (the URL is never logged). */
export function readConn(network: Network): Connection | null {
  const e = getEnv();
  const url = network === "mainnet-beta" ? e.HELIUS_MAINNET : e.HELIUS_DEVNET;
  if (!url) return null;
  let c = conns.get(network);
  if (!c) { c = new Connection(url, "confirmed"); conns.set(network, c); }
  return c;
}

export const curvePda = (mint: string) => bondingCurvePda(new PublicKey(mint));

const initialReal = new Map<Network, { v: number; at: number }>();
async function initialRealTokens(network: Network, conn: Connection): Promise<number> {
  const hit = initialReal.get(network);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.v;
  try {
    const g = await new OnlinePumpSdk(conn).fetchGlobal();
    const v = Number(g.initialRealTokenReserves.toString());
    if (v > 0) { initialReal.set(network, { v, at: Date.now() }); return v; }
  } catch { /* use the last known value or the program default */ }
  return hit?.v ?? 793_100_000_000_000;
}

/** Bonding-curve state for many mints in one RPC call. A mint with no curve account maps to null. */
export async function readCurves(network: Network, mints: string[]): Promise<Map<string, CurveState | null>> {
  const out = new Map<string, CurveState | null>();
  const conn = readConn(network);
  if (!conn || mints.length === 0) return out;
  const total = await initialRealTokens(network, conn);
  for (let i = 0; i < mints.length; i += 90) {
    const part = mints.slice(i, i + 90);
    let infos;
    try { infos = await conn.getMultipleAccountsInfo(part.map(curvePda)); } catch { continue; }
    part.forEach((m, k) => {
      const info = infos[k];
      if (!info) { out.set(m, null); return; }
      try {
        const bc = PUMP_SDK.decodeBondingCurve(info as Parameters<typeof PUMP_SDK.decodeBondingCurve>[0]);
        const migrated = isBondingCurveMigrated(bc);
        const complete = bc.complete || migrated;
        const real = Number(bc.realTokenReserves.toString());
        const pct = complete ? 100 : Math.min(100, Math.max(0, (1 - real / total) * 100));
        const vTok = Number(bc.virtualTokenReserves.toString());
        const vSol = Number(bc.virtualQuoteReserves.toString());
        const price = !migrated && vTok > 0 ? vSol / 1e9 / (vTok / 1e6) : null;
        const supply = Number(bc.tokenTotalSupply.toString()) / 1e6;
        out.set(m, { progressPct: Math.round(pct * 100) / 100, complete, priceSol: price, marketCapSol: price != null ? price * supply : null });
      } catch { out.set(m, null); }
    });
  }
  return out;
}
