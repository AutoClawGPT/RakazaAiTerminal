import "server-only";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { assertExecuteAllowed } from "@/lib/execute-gate";
import { ensureSchema, sql } from "@/lib/db";
import { buildLaunch } from "./build-tx";
import { checkCaps, verifyApproval, type LaunchPlan } from "./approval";
import { verifySplitOnChain, type SplitReport } from "./verify-split";

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
  await ensureSchema();
  const rows = (await q`SELECT COALESCE(SUM(dev_buy_sol + 0.03),0) AS s FROM launches WHERE created_at > now() - interval '24 hours' AND status <> 'failed'`) as { s: string }[];
  return Number(rows[0]?.s ?? 0);
}

async function record(plan: LaunchPlan, status: string, tx1?: string, tx2?: string, note?: string) {
  const q = sql(); if (!q) return;
  await ensureSchema();
  await q`INSERT INTO launches (mint, network, mode, name, symbol, uri, creator, dev_buy_sol, shareholders, status, tx1, tx2, note)
    VALUES (${plan.mint}, ${plan.network}, ${plan.mode}, ${plan.name}, ${plan.symbol}, ${plan.uri}, ${plan.creator}, ${plan.devBuySol}, ${JSON.stringify(plan.shareholders)}::jsonb, ${status}, ${tx1 ?? null}, ${tx2 ?? null}, ${note ?? null})
    ON CONFLICT (mint) DO UPDATE SET status = ${status}, tx1 = COALESCE(${tx1 ?? null}, launches.tx1), tx2 = COALESCE(${tx2 ?? null}, launches.tx2), note = ${note ?? null}, updated_at = now()`;
}

async function sendAndConfirm(conn: Connection, tx: VersionedTransaction, blockhash: string, lastValidBlockHeight: number): Promise<string> {
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new LaunchExecError(`Transaction ${sig} failed on-chain: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export interface ExecResult { ok: boolean; stage: string; tx1?: string; tx2?: string; split?: SplitReport; error?: string }

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
  const bal = (await conn.getBalance(treasury.publicKey)) / 1e9;
  if (bal < plan.devBuySol + 0.03) throw new LaunchExecError(`Treasury has ${bal.toFixed(4)} SOL, which is not enough for this launch.`);

  const built = await buildLaunch(conn, { creator: treasury.publicKey, mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders: plan.shareholders.map((s) => ({ ...s, label: "" })), devBuySol: plan.devBuySol });
  await record(plan, "creating");
  let tx1: string;
  try {
    built.tx1.sign([treasury, mintKp]);
    tx1 = await sendAndConfirm(conn, built.tx1, built.blockhash, built.lastValidBlockHeight);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    await record(plan, "failed", undefined, undefined, msg);
    return { ok: false, stage: "create", error: msg };
  }
  await record(plan, "created_unsplit", tx1);
  return finishSplit(plan, conn, treasury, tx1);
}

/** Second step on its own, so a failed or timed-out split can be retried safely. */
export async function finishSplit(plan: LaunchPlan, conn: Connection, treasury: Keypair, tx1?: string): Promise<ExecResult> {
  const expected = plan.shareholders;
  const existing = await verifySplitOnChain(conn, plan.mint, expected);
  if (existing.ok) { await record(plan, "live", tx1, undefined, "split already verified"); return { ok: true, stage: "done", tx1, split: existing }; }
  const built = await buildLaunch(conn, { creator: treasury.publicKey, mint: new PublicKey(plan.mint), name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders: expected.map((s) => ({ ...s, label: "" })), devBuySol: 0 });
  try {
    built.tx2.sign([treasury]);
    const tx2 = await sendAndConfirm(conn, built.tx2, built.blockhash, built.lastValidBlockHeight);
    const split = await verifySplitOnChain(conn, plan.mint, expected);
    await record(plan, split.ok ? "live" : "split_mismatch", tx1, tx2, split.ok ? undefined : split.problems.join(" "));
    return { ok: split.ok, stage: "split", tx1, tx2, split, error: split.ok ? undefined : split.problems.join(" ") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "split failed";
    await record(plan, "created_unsplit", tx1, undefined, msg);
    return { ok: false, stage: "split", tx1, error: `${msg} The token exists. Retry the split step.` };
  }
}

export async function resumeSplit(plan: LaunchPlan, ticket: string | undefined): Promise<ExecResult> {
  assertExecuteAllowed("resume split");
  const v = verifyApproval(ticket, plan, getEnv().SESSION_SECRET);
  if (!v.ok) throw new LaunchExecError(v.reason);
  return finishSplit(plan, connectionFor(plan.network), loadTreasurySigner());
}
