import "server-only";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import { validateSplit, type Shareholder } from "@/lib/tools/splits";

/**
 * Builds the two unsigned launch transactions. It never signs and never sends.
 * Signing happens elsewhere, behind assertExecuteAllowed() and the owner's approval.
 *
 *  TX1: create the token (Token-2022 mint, optional dev buy). The mint keypair signs.
 *  TX2: open the fee-sharing config and set the final shareholders (permanent). Sent only after TX1 lands.
 */
export interface LaunchInput {
  creator: PublicKey; // pays, signs, and is the coin's creator (treasury when sponsored, the user's wallet otherwise)
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  shareholders: Shareholder[];
  devBuySol: number;
}

export interface BuiltLaunch {
  tx1: VersionedTransaction;
  tx2: VersionedTransaction;
  tx1Bytes: number;
  tx2Bytes: number;
  blockhash: string;
  lastValidBlockHeight: number;
}

const CU_TX1 = 300_000;
const CU_TX2 = 250_000;
const PRIORITY_MICROLAMPORTS = 100_000;

export class LaunchBuildError extends Error {}

export function checkInput(i: LaunchInput) {
  if (i.name.length < 1 || i.name.length > 32) throw new LaunchBuildError("Name must be 1 to 32 characters.");
  if (i.symbol.length < 2 || i.symbol.length > 10) throw new LaunchBuildError("Ticker must be 2 to 10 characters.");
  if (!/^https:\/\/.{5,190}$/.test(i.uri)) throw new LaunchBuildError("Metadata link must be an https link under 200 characters.");
  if (!(i.devBuySol >= 0 && i.devBuySol <= 85)) throw new LaunchBuildError("Dev buy must be between 0 and 85 SOL.");
  const v = validateSplit(i.shareholders);
  if (!v.ok) throw new LaunchBuildError(v.errors[0]);
}

export async function buildLaunch(conn: Connection, i: LaunchInput): Promise<BuiltLaunch> {
  checkInput(i);
  const online = new OnlinePumpSdk(conn);
  const ixs1: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: CU_TX1 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })];
  if (i.devBuySol > 0) {
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const solAmount = new BN(Math.round(i.devBuySol * 1e9));
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
    ixs1.push(...(await PUMP_SDK.createV2AndBuyInstructions({ global, mint: i.mint, name: i.name, symbol: i.symbol, uri: i.uri, creator: i.creator, user: i.creator, amount, solAmount, mayhemMode: false })));
  } else {
    ixs1.push(await PUMP_SDK.createV2Instruction({ mint: i.mint, name: i.name, symbol: i.symbol, uri: i.uri, creator: i.creator, user: i.creator, mayhemMode: false }));
  }
  const cfgIx = await PUMP_SDK.createFeeSharingConfig({ creator: i.creator, mint: i.mint, pool: null });
  const shareIx = await PUMP_SDK.updateFeeSharesV2({
    authority: i.creator,
    mint: i.mint,
    currentShareholders: [i.creator],
    newShareholders: i.shareholders.map((s) => ({ address: new PublicKey(s.address), shareBps: s.shareBps })),
    quoteMint: NATIVE_MINT,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    bondingCurveComplete: false,
  });
  const ixs2: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: CU_TX2 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }), cfgIx, shareIx];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const mk = (ixs: TransactionInstruction[]) => new VersionedTransaction(new TransactionMessage({ payerKey: i.creator, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
  const tx1 = mk(ixs1), tx2 = mk(ixs2);
  return { tx1, tx2, tx1Bytes: tx1.serialize().length, tx2Bytes: tx2.serialize().length, blockhash, lastValidBlockHeight };
}

/** Read-only simulation. Signatures are not checked, nothing is sent. */
export async function simulateOnly(conn: Connection, tx: VersionedTransaction) {
  const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  return { err: r.value.err, unitsConsumed: r.value.unitsConsumed ?? null, logs: r.value.logs ?? [] };
}

/** A throwaway mint address for simulations only. */
export const scratchMint = () => Keypair.generate().publicKey;
