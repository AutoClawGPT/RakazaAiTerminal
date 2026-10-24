import "server-only";
import { ComputeBudgetProgram, Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { getEnv } from "@/lib/env";
import { assertExecuteAllowed } from "@/lib/execute-gate";
import { ensureSchema, sql } from "@/lib/db";
import { connectionFor, loadTreasurySigner, LaunchExecError } from "./execute";
import { verifySplitOnChain } from "./verify-split";
import type { LaunchPlan } from "./approval";

/**
 * Sends a token's accrued creator fees to the shareholders on its on-chain sharing config (70% creator, 30% platform).
 * Anyone can call distribute on-chain and the program decides who gets paid, so this can only pay the verified shareholders.
 * The treasury only pays the network fee. Each payout is read back from the confirmed transaction and recorded.
 */
export interface DistributeResult { mint: string; ok: boolean; skipped?: string; sig?: string; paid?: { wallet: string; lamports: number }[]; error?: string }

interface L { mint: string; network: LaunchPlan["network"]; shareholders: { address: string; shareBps: number }[] }

export async function distributeOne(l: L, conn: Connection = connectionFor(l.network)): Promise<DistributeResult> {
  assertExecuteAllowed("distribute creator fees");
  const env = getEnv();
  if (l.network !== env.NEXT_PUBLIC_SOLANA_NETWORK) return { mint: l.mint, ok: false, skipped: "other network" };
  const mint = new PublicKey(l.mint);
  const sp = await verifySplitOnChain(conn, l.mint, l.shareholders);
  if (!sp.ok) return { mint: l.mint, ok: false, skipped: `split not verified: ${sp.problems.join(" ")}` };
  const sdk = new OnlinePumpSdk(conn);
  const min = await sdk.getMinimumDistributableFee(mint);
  if (!min.canDistribute) return { mint: l.mint, ok: true, skipped: `nothing to send yet (${Number(min.distributableFees.toString())} of ${Number(min.minimumRequired.toString())} lamports needed)` };
  const treasury = loadTreasurySigner();
  const built = await sdk.buildDistributeCreatorFeesInstructions(mint, { payer: treasury.publicKey });
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: treasury.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }), ...built.instructions] }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  if (tx.serialize().length > 1232) throw new LaunchExecError("The distribution transaction is too large for one send.");
  tx.sign([treasury]);
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) return { mint: l.mint, ok: false, sig, error: `Transaction failed on-chain: ${JSON.stringify(res.value.err)}` };
  const paid = await readPayouts(conn, sig, l.shareholders.map((s) => s.address));
  const q = sql();
  if (q) { await ensureSchema(); for (const p of paid) await q`INSERT INTO fee_payouts (mint, network, wallet, lamports, sig) VALUES (${l.mint}, ${l.network}, ${p.wallet}, ${p.lamports}, ${sig}) ON CONFLICT (sig, wallet) DO NOTHING`; }
  return { mint: l.mint, ok: true, sig, paid };
}

/** Exact lamports each shareholder received, from the confirmed transaction's balance changes. */
export async function readPayouts(conn: Connection, sig: string, wallets: string[]): Promise<{ wallet: string; lamports: number }[]> {
  const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!t?.meta) return [];
  const keys = t.transaction.message.getAccountKeys({ accountKeysFromLookups: t.meta.loadedAddresses }).keySegments().flat().map((k) => k.toBase58());
  const out: { wallet: string; lamports: number }[] = [];
  for (const w of wallets) {
    const i = keys.indexOf(w);
    if (i < 0) continue;
    const d = t.meta.postBalances[i] - t.meta.preBalances[i];
    if (d > 0) out.push({ wallet: w, lamports: d });
  }
  return out;
}

export async function distributeAll(): Promise<DistributeResult[]> {
  const q = sql();
  if (!q) throw new LaunchExecError("The database is not configured.");
  await ensureSchema();
  const net = getEnv().NEXT_PUBLIC_SOLANA_NETWORK;
  const rows = (await q`SELECT mint, network, shareholders FROM launches WHERE status = 'live' AND network = ${net} ORDER BY updated_at DESC LIMIT 50`) as unknown as L[];
  const conn = connectionFor(net);
  const out: DistributeResult[] = [];
  for (const l of rows) {
    try { out.push(await distributeOne(l, conn)); }
    catch (e) { out.push({ mint: l.mint, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "failed" }); }
  }
  return out;
}
