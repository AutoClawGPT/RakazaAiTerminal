import "server-only";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { assertExecuteAllowed } from "@/lib/execute-gate";
import { ensureSchema, sql } from "@/lib/db";
import { buildDevBuy, buildLaunch } from "./build-tx";
import { checkCaps, verifyApproval, type LaunchPlan } from "./approval";
import { verifySplitOnChain, type SplitReport } from "./verify-split";
import { withRetry, sleep } from "@/lib/retry";

/**
 * The only place that signs. Every call needs: EXECUTE_ENABLED, a valid approval ticket for this exact plan,
 * the spend caps, and the treasury key from env. Nothing here runs unless the owner pressed approve.
 */
export class LaunchExecError extends Error {}

export function connectionFor(network: LaunchPlan["network"]): Connection {
  const e = getEnv();
  const url = network === "mainnet-beta" ? e.HELIUS_MAINNET : e.HELIUS_DEVNET;
  if (!url) throw new LaunchExecError(`No RPC URL for ${network}. Set ${network === "mainnet-beta" ? "HELIUS_MAINNET" : "HELIUS_DEVNET"}.`);
  return new Connection(url, "confirmed");
}

/** Reads the treasury key from env only. Accepts base58 or a JSON byte array. Never logged. */
export function loadTreasurySigner(): Keypair {
  const raw = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!raw) throw new LaunchExecError("TREASURY_PRIVATE_KEY is not set. The owner adds it in the Vercel environment settings.");
  let bytes: Uint8Array;
  try { bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw); }
  catch { throw new LaunchExecError("TREASURY_PRIVATE_KEY is not valid base58 or a JSON byte array."); }
  if (bytes.length !== 64) throw new LaunchExecError("TREASURY_PRIVATE_KEY must decode to 64 bytes.");
  const kp = Keypair.fromSecretKey(bytes);
  const want = getEnv().TREASURY_PUBKEY;
  if (want && kp.publicKey.toBase58() !== want) throw new LaunchExecError("TREASURY_PRIVATE_KEY does not match TREASURY_PUBKEY.");
  return kp;
}

async function spentToday(): Promise<number> {
  const q = sql(); if (!q) return 0;
  const rows = await withRetry(async () => { await ensureSchema(); return (await q`SELECT COALESCE(SUM(dev_buy_sol + 0.03),0) AS s FROM launches WHERE created_at > now() - interval '24 hours' AND status <> 'failed'`) as { s: string }[]; });
  return Number(rows[0]?.s ?? 0);
}

export async function record(plan: LaunchPlan, status: string, tx1?: string, tx2?: string, note?: string) {
  const q = sql(); if (!q) return;
  await withRetry(async () => {
  await ensureSchema();
  await q`INSERT INTO launches (mint, network, mode, name, symbol, uri, creator, dev_buy_sol, shareholders, status, tx1, tx2, note)
    VALUES (${plan.mint}, ${plan.network}, ${plan.mode}, ${plan.name}, ${plan.symbol}, ${plan.uri}, ${plan.creator}, ${plan.devBuySol}, ${JSON.stringify(plan.shareholders)}::jsonb, ${status}, ${tx1 ?? null}, ${tx2 ?? null}, ${note ?? null})
    ON CONFLICT (mint) DO UPDATE SET status = ${status}, tx1 = COALESCE(${tx1 ?? null}, launches.tx1), tx2 = COALESCE(${tx2 ?? null}, launches.tx2), note = ${note ?? null}, updated_at = now()`;
  });
}

/**
 * Sends one signed transaction. Re-sending the same signed bytes is safe (same signature, can land once), so temporary RPC
 * errors are retried. If the blockhash expires we check the chain once more before reporting failure.
 */
export async function sendAndConfirm(conn: Connection, tx: VersionedTransaction, blockhash: string, lastValidBlockHeight: number): Promise<string> {
  const sig = await withRetry(() => conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 }), { tries: 3, baseMs: 700 });
  try {
    const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new LaunchExecError(`Transaction ${sig} failed on-chain: ${JSON.stringify(res.value.err)}`);
  } catch (e) {
    if (e instanceof LaunchExecError) throw e;
    await sleep(1500);
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
    if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    if (st?.err) throw new LaunchExecError(`Transaction ${sig} failed on-chain: ${JSON.stringify(st.err)}`);
    throw new LaunchExecError(`Transaction ${sig} was not confirmed in time (${e instanceof Error ? e.message.slice(0, 80) : "timeout"}). It did not land, so it is safe to retry.`);
  }
  return sig;
}

export interface ExecResult { ok: boolean; stage: string; tx1?: string; tx2?: string; devBuy?: string; split?: SplitReport; error?: string }

export async function executeSponsoredLaunch(plan: LaunchPlan, ticket: string | undefined, mintSecret: Uint8Array): Promise<ExecResult> {
  assertExecuteAllowed("sponsored launch");
  const env = getEnv();
  if (plan.mode !== "sponsored") throw new LaunchExecError("Only sponsored launches are signed by the server. Own-wallet launches are signed in the user's wallet.");
  if (!env.SPONSORED_ENABLED) throw new LaunchExecError("SPONSORED_ENABLED is not true.");
  if (plan.network !== env.NEXT_PUBLIC_SOLANA_NETWORK) throw new LaunchExecError("The plan network does not match the app network.");
  const v = verifyApproval(ticket, plan, env.SESSION_SECRET);
  if (!v.ok) throw new LaunchExecError(v.reason);
  const capErr = checkCaps(plan, { maxLaunchSol: env.MAX_LAUNCH_SOL, maxDailySol: env.MAX_DAILY_SPEND_SOL, spentTodaySol: await spentToday() });
  if (capErr) throw new LaunchExecError(capErr);

  const treasury = loadTreasurySigner();
  if (treasury.publicKey.toBase58() !== plan.creator) throw new LaunchExecError("The sponsored creator must be the treasury wallet.");
  const mintKp = Keypair.fromSecretKey(mintSecret);
  if (mintKp.publicKey.toBase58() !== plan.mint) throw new LaunchExecError("The mint key does not match the approved mint address.");

  const conn = connectionFor(plan.network);
  const bal = (await withRetry(() => conn.getBalance(treasury.publicKey))) / 1e9;
  if (bal < plan.devBuySol + 0.03) throw new LaunchExecError(`Treasury has ${bal.toFixed(4)} SOL, which is not enough for this launch.`);

  const built = await buildLaunch(conn, { creator: treasury.publicKey, mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders: plan.shareholders.map((s) => ({ ...s, label: "" })), devBuySol: 0 });
  await record(plan, "creating");
  let tx1: string;
  try {
    built.tx1.sign([treasury, mintKp]);
    tx1 = await sendAndConfirm(conn, built.tx1, built.blockhash, built.lastValidBlockHeight);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    // A timeout is not proof the token was not made. Check the chain before calling it failed.
    const landed = await withRetry(() => conn.getAccountInfo(mintKp.publicKey), { tries: 2 }).then((a) => !!a, () => false);
    if (!landed) {
      await record(plan, "failed", undefined, undefined, msg);
      return { ok: false, stage: "create", error: msg };
    }
    tx1 = "unconfirmed";
  }
  await record(plan, "created_unsplit", tx1 === "unconfirmed" ? undefined : tx1);
  const res = await finishSplit(plan, conn, treasury, tx1 === "unconfirmed" ? undefined : tx1);
  if (!res.ok || plan.devBuySol <= 0) return res;
  // Dev buy is its own transaction, sent only after the split is verified.
  try {
    const d = await buildDevBuy(conn, treasury.publicKey, new PublicKey(plan.mint), plan.devBuySol);
    d.tx.sign([treasury]);
    const buySig = await sendAndConfirm(conn, d.tx, d.blockhash, d.lastValidBlockHeight);
    await record(plan, "live", tx1, res.tx2, `dev buy ${buySig}`);
    return { ...res, devBuy: buySig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "dev buy failed";
    await record(plan, "live", tx1, res.tx2, `dev buy failed: ${msg}`);
    return { ...res, error: `The token is live with the 70/30 split, but the dev buy failed: ${msg}` };
  }
}

/** Second step on its own, so a failed or timed-out split can be retried safely. */
export async function finishSplit(plan: LaunchPlan, conn: Connection, treasury: Keypair, tx1?: string): Promise<ExecResult> {
  const expected = plan.shareholders;
  let lastErr = "split failed";
  // Up to 3 attempts. Each one first checks the chain, so a split that already landed is never sent twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const existing = await withRetry(() => verifySplitOnChain(conn, plan.mint, expected), { tries: 2 });
      if (existing.ok) { await record(plan, "live", tx1, undefined, attempt ? "split verified after retry" : "split already verified"); return { ok: true, stage: "done", tx1, split: existing }; }
      const built = await buildLaunch(conn, { creator: treasury.publicKey, mint: new PublicKey(plan.mint), name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders: expected.map((s) => ({ ...s, label: "" })), devBuySol: 0 });
      built.tx2.sign([treasury]);
      const tx2 = await sendAndConfirm(conn, built.tx2, built.blockhash, built.lastValidBlockHeight);
      const split = await withRetry(() => verifySplitOnChain(conn, plan.mint, expected), { tries: 3, baseMs: 800 });
      await record(plan, split.ok ? "live" : "split_mismatch", tx1, tx2, split.ok ? undefined : split.problems.join(" "));
      return { ok: split.ok, stage: "split", tx1, tx2, split, error: split.ok ? undefined : split.problems.join(" ") };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "split failed";
      if (/failed on-chain/.test(lastErr)) break; // the program refused it; retrying the same thing will not help
      await sleep(1200 * (attempt + 1));
    }
  }
  await record(plan, "created_unsplit", tx1, undefined, lastErr);
  return { ok: false, stage: "split", tx1, error: `${lastErr} The token exists. Retry the split step.` };
}

export async function resumeSplit(plan: LaunchPlan, ticket: string | undefined): Promise<ExecResult> {
  assertExecuteAllowed("resume split");
  const v = verifyApproval(ticket, plan, getEnv().SESSION_SECRET);
  if (!v.ok) throw new LaunchExecError(v.reason);
  return finishSplit(plan, connectionFor(plan.network), loadTreasurySigner());
}
