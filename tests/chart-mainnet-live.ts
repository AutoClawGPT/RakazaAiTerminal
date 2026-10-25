// READ-ONLY. Checks the chart data path against a live mainnet pump.fun mint: DexScreener pair + GeckoTerminal candles + on-chain curve read. No transactions.
import { dexMarket, geckoCandles } from "../src/lib/market/mainnet";
import { readCurves } from "../src/lib/market/curve";
const MINT = process.env.MINT ?? "4za3s1LwdU5TUuWvEEeXSATazfAMTdw3Fv6McxBRpump";
const run = async () => {
  const m = await dexMarket(MINT);
  console.log("dex", JSON.stringify(m && { dex: m.dex, priceUsd: m.priceUsd, priceSol: m.priceSol, mcap: m.marketCapUsd, liq: m.liquidityUsd }));
  if (m) for (const iv of ["1m", "5m", "1h"] as const) {
    const c = await geckoCandles(m.pair, iv, 30);
    const last = c?.[c.length - 1];
    console.log(iv, "candles", c?.length ?? 0, "last", last ? new Date(last.t * 1000).toISOString() + " c=" + last.c : "none", "ageSec", last ? Math.round(Date.now() / 1000 - last.t) : "-");
  }
  const cur = await readCurves("mainnet-beta", [MINT]);
  console.log("curve", JSON.stringify(cur.get(MINT) ?? null, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
};
run().catch((e) => { console.log("ERR", String(e).slice(0, 200)); });
