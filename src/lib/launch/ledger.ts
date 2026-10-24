import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { ensureSchema, sql } from "@/lib/db";
import { connectionFor } from "./execute";
import type { LaunchPlan } from "./approval";
import { verifySplitOnChain } from "./verify-split";

export interface LedgerShare { address: string; shareBps: number; pendingLamports: number; sentLamports: number }
export interface LedgerRow {
  mint: string; network: LaunchPlan["network"]; mode: string; name: string; symbol: string; creator: string; status: string;
  devBuySol: number; tx1?: string; tx2?: string; note?: string; createdAt: string;
  splitVerified: boolean | null; distributableLamports: number | null; canDistribute: boolean | null;
  shares: LedgerShare[];
}
export interface WalletTotals { wallet: string; tokens: number; pendingLamports: number; sentLamports: number }
export interface Ledger { ok: true; at: string; rows: LedgerRow[]; wallets: WalletTotals[]; totals: { launches: number; live: number; pendingLamports: number; sentLamports: number }; rpcNote?: string }

interface DbLaunch { mint: string; network: LaunchPlan["network"]; mode: string; name: string; symbol: string; creator: string; dev_buy_sol: string; shareholders: { address: string; shareBps: number }[]; status: string; tx1: string | null; tx2: string | null; note: string | null; created_at: string }

const cache = new Map<string, { at: number; v: { split: boolean | null; dist: number | null; can: boolean | null } }>();
const TTL = 8000;

async function onChain(conn: Connection, l: DbLaunch) {
  const hit = cache.get(l.mint);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  let split: boolean | null = null, dist: number | null = null, can: boolean | null = null;
  if (["live", "split_mismatch", "created_unsplit"].includes(l.status)) {
    try { split = (await verifySplitOnChain(conn, l.mint, l.shareholders)).ok; } catch { split = null; }
    if (split) {
      try {
        const r = await new OnlinePumpSdk(conn).getMinimumDistributableFee(new PublicKey(l.mint));
        dist = Number(r.distributableFees.toString()); can = r.canDistribute;
      } catch { dist = null; }
    }
  }
  const v = { split, dist, can };
  cache.set(l.mint, { at: Date.now(), v });
  return v;
}

export async function buildLedger(limit = 25): Promise<Ledger | { ok: false; error: string }> {
  const q = sql();
  if (!q) return { ok: false, error: "The database is not configured (DATABASE_URL)." };
  await ensureSchema();
  const launches = (await q`SELECT mint, network, mode, name, symbol, creator, dev_buy_sol, shareholders, status, tx1, tx2, note, created_at FROM launches ORDER BY created_at DESC LIMIT ${limit}`) as unknown as DbLaunch[];
  const paid = (await q`SELECT mint, wallet, SUM(lamports)::text AS s FROM fee_payouts GROUP BY mint, wallet`) as unknown as { mint: string; wallet: string; s: string }[];
  const sent = new Map(paid.map((p) => [`${p.mint}:${p.wallet}`, Number(p.s)]));
  const conns: Partial<Record<LaunchPlan["network"], Connection>> = {};
  let rpcNote: string | undefined;
  const rows: LedgerRow[] = [];
  for (const l of launches) {
    let oc = { split: null as boolean | null, dist: null as number | null, can: null as boolean | null };
    try { oc = await onChain((conns[l.network] ??= connectionFor(l.network)), l); } catch (e) { rpcNote = e instanceof Error ? e.message : "RPC unavailable"; }
    const shares = l.shareholders.map((s) => ({
      address: s.address, shareBps: s.shareBps,
      pendingLamports: oc.dist == null ? 0 : Math.floor((oc.dist * s.shareBps) / 10000),
      sentLamports: sent.get(`${l.mint}:${s.address}`) ?? 0,
    }));
    rows.push({ mint: l.mint, network: l.network, mode: l.mode, name: l.name, symbol: l.symbol, creator: l.creator, status: l.status, devBuySol: Number(l.dev_buy_sol), tx1: l.tx1 ?? undefined, tx2: l.tx2 ?? undefined, note: l.note ?? undefined, createdAt: new Date(l.created_at).toISOString(), splitVerified: oc.split, distributableLamports: oc.dist, canDistribute: oc.can, shares });
  }
  const byWallet = new Map<string, WalletTotals>();
  for (const r of rows) for (const s of r.shares) {
    const w = byWallet.get(s.address) ?? { wallet: s.address, tokens: 0, pendingLamports: 0, sentLamports: 0 };
    w.tokens += 1; w.pendingLamports += s.pendingLamports; w.sentLamports += s.sentLamports; byWallet.set(s.address, w);
  }
  const wallets = [...byWallet.values()].sort((a, b) => b.pendingLamports + b.sentLamports - (a.pendingLamports + a.sentLamports));
  return {
    ok: true, at: new Date().toISOString(), rows, wallets, rpcNote,
    totals: { launches: rows.length, live: rows.filter((r) => r.status === "live").length, pendingLamports: wallets.reduce((a, w) => a + w.pendingLamports, 0), sentLamports: wallets.reduce((a, w) => a + w.sentLamports, 0) },
  };
}
