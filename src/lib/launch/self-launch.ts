import "server-only";
import { PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { assertExecuteAllowed } from "@/lib/execute-gate";
import { buildDevBuy, buildLaunch } from "./build-tx";
import { verifyApproval, type LaunchPlan } from "./approval";
import { connectionFor, record } from "./execute";
import { decodeTx, relay } from "./relay";
import { verifySplitOnChain, type SplitReport } from "./verify-split";

/**
 * Self launch: the user's own wallet is the creator and pays. The server never holds their key.
 * Each step hands back a fresh unsigned transaction (a blockhash only lives about a minute), the browser signs it,
 * and the server checks it and forwards it. The fee split is verified on-chain before the dev buy is offered.
 */
export type SelfStep = "create" | "split" | "buy";
export class SelfLaunchError extends Error {}

function guardPlan(plan: LaunchPlan, ticket: string | undefined) {
  assertExecuteAllowed("self launch");
  const env = getEnv();
  if (plan.mode !== "own-wallet") throw new SelfLaunchError("This is not a self-launch plan.");
  if (plan.network !== env.NEXT_PUBLIC_SOLANA_NETWORK) throw new SelfLaunchError("The plan network does not match the app network.");
  const v = verifyApproval(ticket, plan, env.SESSION_SECRET);
  if (!v.ok) throw new SelfLaunchError(v.reason);
}

export async function selfTx(plan: LaunchPlan, ticket: string | undefined, step: SelfStep): Promise<{ tx: string; bytes: number; blockhash: string }> {
  guardPlan(plan, ticket);
  const conn = connectionFor(plan.network);
  const creator = new PublicKey(plan.creator);
  if (step === "buy") {
    if (plan.devBuySol <= 0) throw new SelfLaunchError("This plan has no dev buy.");
    const sp = await verifySplitOnChain(conn, plan.mint, plan.shareholders);
    if (!sp.ok) throw new SelfLaunchError("The fee split is not confirmed on-chain yet, so the dev buy is held back.");
    const d = await buildDevBuy(conn, creator, new PublicKey(plan.mint), plan.devBuySol);
    return { tx: Buffer.from(d.tx.serialize()).toString("base64"), bytes: d.bytes, blockhash: d.blockhash };
  }
  const built = await buildLaunch(conn, { creator, mint: new PublicKey(plan.mint), name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders: plan.shareholders.map((s) => ({ ...s, label: "" })), devBuySol: 0 });
  const t = step === "create" ? built.tx1 : built.tx2;
  return { tx: Buffer.from(t.serialize()).toString("base64"), bytes: t.serialize().length, blockhash: built.blockhash };
}

export async function selfRelay(plan: LaunchPlan, ticket: string | undefined, step: SelfStep, signedB64: string): Promise<{ sig: string; split?: SplitReport }> {
  guardPlan(plan, ticket);
  const conn = connectionFor(plan.network);
  const tx = decodeTx(signedB64);
  if (step === "create") {
    // A second create would fail anyway, but say it clearly.
    if (await conn.getAccountInfo(new PublicKey(plan.mint))) throw new SelfLaunchError("This mint already exists on-chain.");
    await record(plan, "creating");
    try {
      const sig = await relay(conn, tx, plan.creator);
      await record(plan, "created_unsplit", sig);
      return { sig };
    } catch (e) { await record(plan, "failed", undefined, undefined, e instanceof Error ? e.message : "create failed"); throw e; }
  }
  if (step === "split") {
    const sig = await relay(conn, tx, plan.creator);
    const split = await verifySplitOnChain(conn, plan.mint, plan.shareholders);
    await record(plan, split.ok ? "live" : "split_mismatch", undefined, sig, split.ok ? undefined : split.problems.join(" "));
    return { sig, split };
  }
  const sig = await relay(conn, tx, plan.creator);
  await record(plan, "live", undefined, undefined, `dev buy ${sig}`);
  return { sig };
}
