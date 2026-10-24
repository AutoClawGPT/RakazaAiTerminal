import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";

export interface SplitReport { ok: boolean; adminRevoked: boolean; found: boolean; problems: string[]; shareholders: { address: string; shareBps: number }[] }

/** Reads the on-chain fee-sharing config and compares it to what we promised. */
export async function verifySplitOnChain(conn: Connection, mint: string, expected: { address: string; shareBps: number }[]): Promise<SplitReport> {
  const pda = feeSharingConfigPda(new PublicKey(mint));
  const info = await conn.getAccountInfo(pda, "confirmed");
  if (!info) return { ok: false, found: false, adminRevoked: false, shareholders: [], problems: ["The fee-sharing config does not exist yet."] };
  const cfg = PUMP_SDK.decodeSharingConfig(info);
  const got = cfg.shareholders.map((s) => ({ address: s.address.toBase58(), shareBps: s.shareBps }));
  const problems: string[] = [];
  if (got.length !== expected.length) problems.push(`Expected ${expected.length} shareholders, found ${got.length}.`);
  for (const e of expected) {
    const g = got.find((x) => x.address === e.address);
    if (!g) problems.push(`Missing shareholder ${e.address}.`);
    else if (g.shareBps !== e.shareBps) problems.push(`${e.address} has ${g.shareBps} bps, expected ${e.shareBps}.`);
  }
  if (!cfg.adminRevoked) problems.push("The admin is not revoked yet, so the split is not permanent.");
  return { ok: problems.length === 0, found: true, adminRevoked: cfg.adminRevoked, shareholders: got, problems };
}
