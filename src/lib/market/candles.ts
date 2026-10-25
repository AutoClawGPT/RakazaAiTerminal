import "server-only";
import { ensureSchema, sql } from "@/lib/db";
import { INTERVALS, type Candle, type Interval, type PublicTrade, shortAddr } from "./types";

/** OHLCV candles in SOL from stored trades. Each candle opens at the previous close, so the line has no holes. */
export async function candlesFromTrades(mint: string, interval: Interval, limit: number): Promise<Candle[]> {
  const q = sql();
  if (!q) return [];
  await ensureSchema();
  const step = INTERVALS[interval];
  const rows = (await q`
    SELECT extract(epoch FROM b)::bigint AS t, o, h, l, c, v FROM (
      SELECT date_bin(${step + " seconds"}::interval, ts, '2000-01-01'::timestamptz) AS b,
        (array_agg(price_sol ORDER BY ts ASC, signature ASC))[1]::float8 AS o, max(price_sol)::float8 AS h, min(price_sol)::float8 AS l,
        (array_agg(price_sol ORDER BY ts DESC, signature DESC))[1]::float8 AS c, sum(sol_amount)::float8 AS v
      FROM curve_trades WHERE mint = ${mint} GROUP BY b ORDER BY b DESC LIMIT ${limit}
    ) x ORDER BY t ASC`) as unknown as { t: string; o: number; h: number; l: number; c: number; v: number }[];
  const out: Candle[] = rows.map((r) => ({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }));
  for (let i = 1; i < out.length; i++) {
    const c = out[i];
    c.o = out[i - 1].c;
    c.h = Math.max(c.h, c.o);
    c.l = Math.min(c.l, c.o);
  }
  return out;
}

export async function latestTrades(mint: string, limit: number): Promise<PublicTrade[]> {
  const q = sql();
  if (!q) return [];
  await ensureSchema();
  const rows = (await q`SELECT signature, extract(epoch FROM ts)::bigint AS t, side, sol_amount, token_amount, price_sol, trader FROM curve_trades WHERE mint = ${mint} ORDER BY ts DESC, signature DESC LIMIT ${limit}`) as unknown as { signature: string; t: string; side: "buy" | "sell"; sol_amount: number; token_amount: number; price_sol: number; trader: string }[];
  return rows.map((r) => ({ signature: r.signature, t: Number(r.t), side: r.side, solAmount: r.sol_amount, tokenAmount: r.token_amount, priceSol: r.price_sol, trader: shortAddr(r.trader) }));
}
