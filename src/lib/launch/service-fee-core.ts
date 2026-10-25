import { PublicKey, SystemProgram, type VersionedTransaction } from "@solana/web3.js";

/**
 * Pure helpers for the self-launch service fee (no network, no env), so they can be unit tested.
 * The fee is a flat amount in SOL, a SystemProgram transfer from the user's wallet to the platform treasury, inside the create transaction.
 */
export const LAMPORTS = 1_000_000_000;
/** Never ask for less than this or more than this, whatever the price feed says (a broken feed must not overcharge). */
export const MIN_FEE_SOL = 0.001;
export const MAX_FEE_SOL = 0.25;
/** A quote older than this is refused: prepare again to get a fresh price. */
export const QUOTE_TTL_MS = 5 * 60 * 1000;
/** The transfer in the transaction must match the quote within this fraction (rounding only; we build it ourselves). */
export const FEE_TOLERANCE = 0.02;

export interface FeeQuote { usd: number; lamports: number; sol: number; solUsd: number | null; source: "jupiter" | "fallback"; at: number }

/** USD to lamports at a given SOL/USD price, clamped to the safe range. Returns null when the price is unusable. */
export function usdToLamports(usd: number, solUsd: number | null | undefined): number | null {
  if (!(usd >= 0) || !Number.isFinite(usd)) return null;
  if (usd === 0) return 0;
  if (!solUsd || !Number.isFinite(solUsd) || solUsd < 1 || solUsd > 100_000) return null;
  const sol = Math.min(MAX_FEE_SOL, Math.max(MIN_FEE_SOL, usd / solUsd));
  return Math.round(sol * LAMPORTS);
}

export function makeQuote(i: { usd: number; fallbackSol: number; solUsd: number | null; now?: number }): FeeQuote {
  const at = i.now ?? Date.now();
  const live = usdToLamports(i.usd, i.solUsd);
  if (live != null) return { usd: i.usd, lamports: live, sol: live / LAMPORTS, solUsd: i.solUsd, source: "jupiter", at };
  const sol = i.usd === 0 ? 0 : Math.min(MAX_FEE_SOL, Math.max(MIN_FEE_SOL, i.fallbackSol));
  const lamports = Math.round(sol * LAMPORTS);
  return { usd: i.usd, lamports, sol: lamports / LAMPORTS, solUsd: null, source: "fallback", at };
}

export function quoteFresh(quoteAt: number, now = Date.now()): boolean {
  return now - quoteAt >= -5000 && now - quoteAt <= QUOTE_TTL_MS;
}

export interface FeeProblem { ok: false; error: string }

/**
 * Checks a transaction the user's wallet signed. For the create step it must contain exactly one service-fee transfer:
 * SystemProgram.transfer, paid by the creator, to exactly the treasury, for the quoted amount (within the tolerance),
 * and no other SystemProgram instruction (nothing else may move SOL out of the wallet at the top level).
 * With a zero fee there must be no system transfer at all.
 */
export function verifyServiceFee(tx: VersionedTransaction, expect: { creator: string; treasury: string; lamports: number }): { ok: true; paid: number } | FeeProblem {
  const keys = tx.message.staticAccountKeys;
  const sys = SystemProgram.programId.toBase58();
  let paid = 0, transfers = 0;
  for (const ix of tx.message.compiledInstructions) {
    if (keys[ix.programIdIndex].toBase58() !== sys) continue;
    const data = Buffer.from(ix.data);
    // SystemProgram.transfer = u32 instruction index 2, then u64 lamports (12 bytes), accounts [from, to].
    if (data.length !== 12 || data.readUInt32LE(0) !== 2 || ix.accountKeyIndexes.length !== 2) return { ok: false, error: "The transaction contains a system instruction that is not the service fee." };
    const from = keys[ix.accountKeyIndexes[0]].toBase58(), to = keys[ix.accountKeyIndexes[1]].toBase58();
    if (from !== expect.creator) return { ok: false, error: "The service fee must be paid from the launching wallet." };
    if (to !== expect.treasury) return { ok: false, error: "The service fee must go to the platform treasury address." };
    paid += Number(data.readBigUInt64LE(4));
    transfers++;
  }
  if (expect.lamports === 0) return transfers === 0 ? { ok: true, paid: 0 } : { ok: false, error: "This launch has no service fee, but the transaction transfers SOL." };
  if (transfers !== 1) return { ok: false, error: transfers === 0 ? "The service fee transfer is missing from the transaction." : "The transaction has more than one service fee transfer." };
  const lo = Math.floor(expect.lamports * (1 - FEE_TOLERANCE)), hi = Math.ceil(expect.lamports * (1 + FEE_TOLERANCE));
  if (paid < lo || paid > hi) return { ok: false, error: `The service fee in the transaction (${paid / LAMPORTS} SOL) does not match the quote (${expect.lamports / LAMPORTS} SOL).` };
  return { ok: true, paid };
}

export const isPubkey = (s: string): boolean => { try { return new PublicKey(s).toBase58() === s; } catch { return false; } };
