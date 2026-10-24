"use server";
import { isOwnerRequest } from "@/lib/owner";
import { getEnv } from "@/lib/env";
import { buildLedger, type Ledger } from "@/lib/launch/ledger";
import { distributeOne, type DistributeResult } from "@/lib/launch/distribute";
import { connectionFor } from "@/lib/launch/execute";
import { sql, ensureSchema } from "@/lib/db";

type Fail = { ok: false; error: string };
const deny: Fail = { ok: false, error: "The ledger is for the owner and the agent only." };

export async function ledgerAction(): Promise<Ledger | Fail> {
  if (!(await isOwnerRequest())) return deny;
  try { return await buildLedger(25); } catch (e) { console.error("ledger failed:", e instanceof Error ? e.message : "unknown"); return { ok: false, error: "Could not read the ledger. Check the database and RPC keys on the Settings page." }; }
}

/** Owner button: send this token's accrued fees to its shareholders now. */
export async function distributeNowAction(mint: string): Promise<{ ok: true; result: DistributeResult } | Fail> {
  if (!(await isOwnerRequest())) return deny;
  try {
    const q = sql(); if (!q) return { ok: false, error: "The database is not configured." };
    await ensureSchema();
    const rows = (await q`SELECT mint, network, shareholders FROM launches WHERE mint = ${String(mint)} AND network = ${getEnv().NEXT_PUBLIC_SOLANA_NETWORK} LIMIT 1`) as unknown as { mint: string; network: "devnet" | "mainnet-beta"; shareholders: { address: string; shareBps: number }[] }[];
    if (!rows[0]) return { ok: false, error: "That token was not launched through this platform on this network." };
    return { ok: true, result: await distributeOne(rows[0], connectionFor(rows[0].network)) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 220) : "Blocked." }; }
}
