import "server-only";
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";

/**
 * Self-launch relay. The user's wallet signs in the browser; the server only forwards the signed transaction.
 * Before forwarding it checks that the fee payer is the approved creator and that every instruction calls a program we expect.
 */
export class RelayError extends Error {}

const ALLOWED = new Set([
  ComputeBudgetProgram.programId.toBase58(),
  SystemProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  PUMP_PROGRAM_ID.toBase58(),
  PUMP_FEE_PROGRAM_ID.toBase58(),
  // Lighthouse: Phantom may add balance assertions to a transaction it signs. They can only assert, never move funds.
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
]);

export function decodeTx(b64: string): VersionedTransaction {
  try { return VersionedTransaction.deserialize(Buffer.from(b64, "base64")); } catch { throw new RelayError("That is not a valid transaction."); }
}

export function checkRelayable(tx: VersionedTransaction, creator: string): void {
  const keys = tx.message.staticAccountKeys;
  if (tx.message.addressTableLookups.length > 0) throw new RelayError("Lookup tables are not allowed here.");
  if (keys[0].toBase58() !== creator) throw new RelayError("The fee payer is not the approved wallet.");
  for (const ix of tx.message.compiledInstructions) {
    const pid = keys[ix.programIdIndex].toBase58();
    if (!ALLOWED.has(pid)) throw new RelayError(`The transaction calls an unexpected program (${pid}).`);
  }
  const need = tx.message.header.numRequiredSignatures;
  const real = tx.signatures.filter((s) => s.some((b) => b !== 0)).length;
  if (real < need) throw new RelayError(`The transaction needs ${need} signatures and has ${real}.`);
}

export async function relay(conn: Connection, tx: VersionedTransaction, creator: string): Promise<string> {
  checkRelayable(tx, creator);
  const bh = tx.message.recentBlockhash;
  let sig: string;
  try { sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }); }
  catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/no record of a prior credit/i.test(m)) throw new RelayError("Your wallet has no SOL on this network, so it cannot pay for the launch.");
    if (/insufficient (funds|lamports)/i.test(m)) throw new RelayError("Your wallet does not have enough SOL for this step.");
    if (/blockhash not found|expired/i.test(m)) throw new RelayError("The transaction expired before it was sent. Press launch again.");
    throw new RelayError(`The network rejected the transaction: ${m.replace(/\s+/g, " ").slice(0, 220)}`);
  }
  const latest = await conn.getLatestBlockhash("confirmed");
  const res = await conn.confirmTransaction({ signature: sig, blockhash: bh, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new RelayError(`Transaction ${sig} failed on-chain: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export const pumpIds = () => [PUMP_PROGRAM_ID, PUMP_FEE_PROGRAM_ID].map((p: PublicKey) => p.toBase58());
