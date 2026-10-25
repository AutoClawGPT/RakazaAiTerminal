import "server-only";
import { getEnv } from "@/lib/env";
import { jupiterPrice } from "@/lib/api/chain-tools";
import { makeQuote, type FeeQuote } from "./service-fee-core";

const WSOL = "So11111111111111111111111111111111111111112";
let cache: { price: number; at: number } | null = null;

/** SOL/USD from the Jupiter price source, cached for 30 seconds. Null when it cannot be fetched. */
async function solUsd(): Promise<number | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.price;
  try {
    const r = await jupiterPrice([WSOL]);
    const p = r.ok ? r.prices?.[0]?.usd : null;
    if (typeof p === "number" && Number.isFinite(p) && p > 0) { cache = { price: p, at: Date.now() }; return p; }
  } catch { /* fall back below */ }
  return null;
}

/** The flat self-launch service fee, quoted now. USD amount from env (default 2.00); falls back to a fixed SOL amount when the price is unavailable. */
export async function quoteServiceFee(): Promise<FeeQuote> {
  const e = getEnv();
  return makeQuote({ usd: e.SELF_LAUNCH_SERVICE_FEE_USD, fallbackSol: e.SELF_LAUNCH_SERVICE_FEE_SOL, solUsd: await solUsd() });
}
