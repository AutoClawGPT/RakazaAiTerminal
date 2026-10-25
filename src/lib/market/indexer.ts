import "server-only";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import type { ConfirmedSignatureInfo, ParsedTransactionWithMeta, VersionedTransactionResponse } from "@solana/web3.js";
import { ensureSchema, sql } from "@/lib/db";
import { curvePda, readConn, readCurves } from "./curve";
import type { Network } from "./types";

const TRADE_DISC = createHash("sha256").update("event:TradeEvent").digest().subarray(0, 8);
/** Anchor's emit_cpi marker: 8 bytes before the event discriminator inside the self-CPI instruction data. */
const CPI_TAG = Buffer.from("e445a52e51cb9a1d", "hex");

export interface TradeRow { signature: string; mint: string; ts: Date; side: "buy" | "sell"; sol: number; tokens: number; price: number; trader: string }

function fromEventBytes(buf: Buffer, sig: string, mint: string): TradeRow | null {
  if (buf.length < 16 || !buf.subarray(0, 8).equals(TRADE_DISC)) return null;
  try {
    const e = PUMP_SDK.decodeTradeEventBc(buf.subarray(8));
    if (e.mint.toBase58() !== mint) return null;
    const sol = Number(e.solAmount.toString()) / 1e9;
    const tokens = Number(e.tokenAmount.toString()) / 1e6;
    if (!(tokens > 0) || !(sol >= 0)) return null;
    return { signature: sig, mint, ts: new Date(Number(e.timestamp.toString()) * 1000), side: e.isBuy ? "buy" : "sell", sol, tokens, price: sol / tokens, trader: e.user.toBase58() };
  } catch { return null; }
}

/** Trade events for `mint` inside one transaction. Reads program-data log lines first, then the self-CPI inner instructions. */
export function tradesFromTx(tx: VersionedTransactionResponse | ParsedTransactionWithMeta, sig: string, mint: string): TradeRow[] {
  const rows: TradeRow[] = [];
  const logs = tx.meta?.logMessages ?? [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    let buf: Buffer;
    try { buf = Buffer.from(l.slice(14), "base64"); } catch { continue; }
    const r = fromEventBytes(buf, sig, mint);
    if (r) rows.push(r);
  }
  if (rows.length === 0) {
    for (const group of tx.meta?.innerInstructions ?? []) {
      for (const ix of group.instructions as unknown as { data?: string }[]) {
        if (typeof ix.data !== "string") continue;
        let raw: Buffer;
        try { raw = Buffer.from(bs58.decode(ix.data)); } catch { continue; }
        if (raw.length < 24 || !raw.subarray(0, 8).equals(CPI_TAG)) continue;
        const r = fromEventBytes(raw.subarray(8), sig, mint);
        if (r) rows.push(r);
      }
    }
  }
  return rows;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export interface IndexResult { newTrades: number; scanned: number; complete: boolean }

/**
 * Reads new transactions on the bonding curve of one mint and stores each trade once (signature + mint is the key).
 * Newest first. Stops at the last signature it saw before, at maxSigs, or at the deadline.
 */
export async function indexMint(network: Network, mint: string, opts: { maxSigs?: number; deadline?: number } = {}): Promise<IndexResult> {
  const conn = readConn(network);
  const q = sql();
  if (!conn || !q) return { newTrades: 0, scanned: 0, complete: false };
  await ensureSchema();
  const maxSigs = opts.maxSigs ?? 100;
  const deadline = opts.deadline ?? Date.now() + 8000;
  const cur = (await q`SELECT newest_sig, backfilled FROM index_cursor WHERE mint = ${mint}`) as unknown as { newest_sig: string | null; backfilled: boolean }[];
  const until = cur[0]?.newest_sig ?? undefined;
  const pda = curvePda(mint);

  const sigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  let reachedEnd = false;
  while (sigs.length < maxSigs && Date.now() < deadline) {
    const want = Math.min(100, maxSigs - sigs.length);
    const page = await conn.getSignaturesForAddress(pda, { limit: want, before, until }, "confirmed");
    sigs.push(...page);
    before = page[page.length - 1]?.signature;
    if (page.length < want || !before) { reachedEnd = true; break; }
  }
  const good = sigs.filter((s) => !s.err);
  let failed = false;
  const rows: TradeRow[] = [];
  await pool(good, 5, async (s) => {
    if (Date.now() > deadline) { failed = true; return; }
    try {
      const tx = await conn.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!tx) { failed = true; return; }
      rows.push(...tradesFromTx(tx, s.signature, mint));
    } catch { failed = true; }
  });

  if (rows.length) {
    await q`INSERT INTO curve_trades (signature, mint, ts, side, sol_amount, token_amount, price_sol, trader)
      SELECT * FROM unnest(${rows.map((r) => r.signature)}::text[], ${rows.map(() => mint)}::text[], ${rows.map((r) => r.ts.toISOString())}::timestamptz[], ${rows.map((r) => r.side)}::text[], ${rows.map((r) => r.sol)}::float8[], ${rows.map((r) => r.tokens)}::float8[], ${rows.map((r) => r.price)}::float8[], ${rows.map((r) => r.trader)}::text[])
      ON CONFLICT DO NOTHING`;
  }
  // Only move the bookmark when every transaction in the window was read. Repeats are harmless: the key is unique.
  const newest = sigs[0]?.signature ?? until ?? null;
  const advance = !failed;
  await q`INSERT INTO index_cursor (mint, newest_sig, backfilled, last_run) VALUES (${mint}, ${advance ? newest : until ?? null}, ${advance && reachedEnd}, now())
    ON CONFLICT (mint) DO UPDATE SET newest_sig = EXCLUDED.newest_sig, backfilled = index_cursor.backfilled OR EXCLUDED.backfilled, last_run = now()`;
  return { newTrades: rows.length, scanned: good.length, complete: advance };
}

/** Recomputes curve progress and 24h stats for the given mints and stores them. Safe to call often. */
export async function refreshStats(network: Network, mints: string[]): Promise<void> {
  const q = sql();
  if (!q || mints.length === 0) return;
  await ensureSchema();
  const curves = await readCurves(network, mints);
  const agg = (await q`SELECT mint, COALESCE(sum(sol_amount),0)::float8 AS vol, count(*)::int AS n FROM curve_trades WHERE mint = ANY(${mints}) AND ts > now() - interval '24 hours' GROUP BY mint`) as unknown as { mint: string; vol: number; n: number }[];
  const last = (await q`SELECT mint, max(ts) AS ts, (array_agg(price_sol ORDER BY ts DESC))[1]::float8 AS price FROM curve_trades WHERE mint = ANY(${mints}) GROUP BY mint`) as unknown as { mint: string; ts: string; price: number }[];
  for (const m of mints) {
    const c = curves.get(m);
    if (c === undefined) continue; // the RPC call failed: keep what is stored
    const a = agg.find((x) => x.mint === m);
    const l = last.find((x) => x.mint === m);
    const price = c?.priceSol ?? l?.price ?? null;
    const supply = 1_000_000_000;
    await q`INSERT INTO mint_stats (mint, progress_pct, complete, price_sol, mcap_sol, volume24h_sol, trades24h, last_trade_at, updated_at)
      VALUES (${m}, ${c?.progressPct ?? 0}, ${c?.complete ?? false}, ${price}, ${c?.marketCapSol ?? (price != null ? price * supply : null)}, ${a?.vol ?? 0}, ${a?.n ?? 0}, ${l?.ts ?? null}, now())
      ON CONFLICT (mint) DO UPDATE SET progress_pct = EXCLUDED.progress_pct, complete = EXCLUDED.complete, price_sol = EXCLUDED.price_sol, mcap_sol = EXCLUDED.mcap_sol,
        volume24h_sol = EXCLUDED.volume24h_sol, trades24h = EXCLUDED.trades24h, last_trade_at = EXCLUDED.last_trade_at, updated_at = now()`;
  }
}
