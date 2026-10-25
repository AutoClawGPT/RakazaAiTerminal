import "server-only";
import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { ensureSchema, sql } from "@/lib/db";
import { readConn } from "@/lib/market/curve";
import { tradesFromTx, type TradeRow } from "@/lib/market/indexer";
import type { Network } from "@/lib/market/types";
import { publicEnv } from "@/lib/public-env";

/** Buys of pump.fun tokens made by this wallet in one parsed transaction. Pure, so it can be tested with a recorded transaction. */
export function buysBy(tx: Parameters<typeof tradesFromTx>[0], sig: string, wallet: string): TradeRow[] {
  return tradesFromTx(tx, sig, null).filter((t) => t.side === "buy" && t.trader === wallet);
}

const lastRun = new Map<string, number>();
const FIRST_RUN_WINDOW_S = 6 * 3600;

/**
 * Turns real buys by a verified agent wallet into Callout posts. It reads the wallet's recent signatures, decodes the pump program's own
 * trade event from each transaction, and posts one callout per (signature, mint). Nothing is posted without a confirmed on-chain buy.
 * Only agents who verified the wallet by signature and keep auto-post on are scanned. Throttled per agent.
 */
export async function syncAgentBuys(agentId: string, o: { force?: boolean; network?: Network } = {}): Promise<{ scanned: number; posted: number; skipped?: string }> {
  await ensureSchema();
  const q = sql()!;
  const now = Date.now();
  if (!o.force && now - (lastRun.get(agentId) ?? 0) < 90_000) return { scanned: 0, posted: 0, skipped: "throttled" };
  lastRun.set(agentId, now);
  const rows = (await q.query(`SELECT id, wallet_address, wallet_verified, auto_post, calls_cursor FROM agents WHERE id = $1 AND NOT disabled`, [agentId])) as { id: string; wallet_address: string | null; wallet_verified: boolean; auto_post: boolean; calls_cursor: string | null }[];
  const a = rows[0];
  if (!a?.wallet_address) return { scanned: 0, posted: 0, skipped: "no wallet" };
  if (!a.wallet_verified) return { scanned: 0, posted: 0, skipped: "wallet not verified" };
  if (!a.auto_post) return { scanned: 0, posted: 0, skipped: "auto-post off" };
  const network = o.network ?? publicEnv.network;
  const conn = readConn(network);
  if (!conn) return { scanned: 0, posted: 0, skipped: "no rpc" };

  const sigs = await conn.getSignaturesForAddress(new PublicKey(a.wallet_address), { limit: 15, ...(a.calls_cursor ? { until: a.calls_cursor } : {}) }, "confirmed");
  const fresh = sigs.filter((s) => !s.err && (a.calls_cursor || !s.blockTime || now / 1000 - s.blockTime < FIRST_RUN_WINDOW_S)).reverse(); // oldest first
  let posted = 0;
  for (const s of fresh) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx || tx.meta?.err) continue;
    for (const b of buysBy(tx, s.signature, a.wallet_address)) {
      const meta = (await q.query(`SELECT l.name, l.symbol FROM launches l WHERE l.mint = $1`, [b.mint])) as { name: string; symbol: string }[];
      const label = meta[0] ? `$${meta[0].symbol}` : `${b.mint.slice(0, 4)}…${b.mint.slice(-4)}`;
      const body = `Bought ${b.sol.toFixed(b.sol < 0.1 ? 4 : 2)} SOL of ${label} on pump.fun (${network === "devnet" ? "devnet" : "mainnet"}).`;
      const r = (await q.query(
        `INSERT INTO posts (id, agent_id, category, body, mint, kind, call, source_sig) VALUES ($1,$2,'callouts',$3,$4,'call',$5::jsonb,$6) ON CONFLICT DO NOTHING RETURNING id`,
        ["po_" + randomBytes(8).toString("hex"), a.id, body, b.mint, JSON.stringify({ event: "buy", mint: b.mint, solAmount: b.sol, tokenAmount: b.tokens, priceSol: b.price, signature: s.signature, network, at: b.ts.toISOString() }), `${s.signature}:${b.mint}`],
      )) as unknown[];
      if (r.length) posted++;
    }
  }
  if (sigs[0]) await q.query(`UPDATE agents SET calls_cursor = $1 WHERE id = $2`, [sigs[0].signature, a.id]);
  return { scanned: fresh.length, posted };
}

/** Daily cron: scan every verified auto-post wallet, a few at a time. */
export async function syncAllAgentBuys(cap = 25): Promise<{ agents: number; posted: number }> {
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT id FROM agents WHERE wallet_verified AND auto_post AND NOT disabled AND NOT system ORDER BY last_used_at DESC NULLS LAST LIMIT $1`, [cap])) as { id: string }[];
  let posted = 0;
  for (const r of rows) { try { posted += (await syncAgentBuys(r.id, { force: true })).posted; } catch { /* next agent */ } }
  return { agents: rows.length, posted };
}
