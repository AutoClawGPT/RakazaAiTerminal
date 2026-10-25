import "server-only";
import { PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { getEnv } from "@/lib/env";
import { isSelfLaunchEnabled } from "@/lib/execute-gate";
import { treasuryClash } from "@/lib/tools/splits";
import { buildDevBuy, buildSelfCreate, simulateCost } from "./build-tx";
import { signApproval, verifyApproval, type LaunchPlan } from "./approval";
import { connectionFor, record } from "./execute";
import { decodeTx, relay } from "./relay";
import { LAMPORTS, QUOTE_TTL_MS, quoteFresh, verifyServiceFee, type FeeQuote } from "./service-fee-core";
import { quoteServiceFee } from "./service-fee";

/**
 * Self launch: the user's own wallet is the creator and pays. The server never holds their key and never signs.
 *  - ONE create transaction: the mint signs first, then the user's wallet. It contains the flat service fee transfer to the treasury.
 *  - pump.fun's own default applies: 100% of the creator fees go to the creator. No fee sharing, no platform shareholder.
 *  - An optional second transaction buys the dev buy after the token exists.
 * Every transaction is checked here (fee payer, programs, service fee destination and amount) before it is forwarded.
 */
export type SelfStep = "create" | "buy";
export class SelfLaunchError extends Error {}

/** Rough cost of the create transaction on pump.fun (rent for the mint, curve and accounts + network and priority fees), used only if the dry run cannot measure it. */
export const EST_CREATE_LAMPORTS = 25_000_000;
/** Extra headroom when there is a dev buy: its own network fee, priority fee and the token account rent. */
export const BUY_BUFFER_LAMPORTS = 4_000_000;

export interface Breakdown {
  /** pump.fun's own launch cost plus network and priority fees (measured by a dry run when possible). */
  pumpAndNetworkLamports: number;
  /** True when the dry run could not measure it and a safe estimate is shown. */
  estimated: boolean;
  serviceFeeLamports: number;
  serviceFeeUsd: number;
  solUsd: number | null;
  /** "jupiter" = converted at the live price; "fallback" = the fixed SOL amount because the price feed was unreachable. */
  feeSource: FeeQuote["source"];
  devBuyLamports: number;
  bufferLamports: number;
  totalLamports: number;
  balanceLamports: number;
  quoteAt: number;
  quoteExpiresAt: number;
}

function guardPlan(plan: LaunchPlan, ticket: string | undefined) {
  const env = getEnv();
  if (!isSelfLaunchEnabled()) throw new SelfLaunchError("Self launch is switched off on this server.");
  if (plan.mode !== "own-wallet") throw new SelfLaunchError("This is not a self-launch plan.");
  if (plan.network !== env.NEXT_PUBLIC_SOLANA_NETWORK) throw new SelfLaunchError("The plan network does not match the app network.");
  const v = verifyApproval(ticket, plan, env.SESSION_SECRET);
  if (!v.ok) throw new SelfLaunchError(v.reason);
  // Defence in depth on top of the signed ticket: no platform shareholder, the fee goes to the exact treasury, and the treasury is never the creator.
  if (plan.shareholders.length !== 0) throw new SelfLaunchError("A self launch has no platform fee share: the creator keeps 100% of the creator fees.");
  if (env.TREASURY_PUBKEY) {
    if (plan.creator === env.TREASURY_PUBKEY) throw new SelfLaunchError("The treasury cannot be the creator of a self launch.");
    if (!plan.serviceFee || plan.serviceFee.to !== env.TREASURY_PUBKEY) throw new SelfLaunchError("The service fee in the plan does not go to the platform treasury.");
  }
  if (!plan.serviceFee || !Number.isInteger(plan.serviceFee.lamports) || plan.serviceFee.lamports < 0) throw new SelfLaunchError("The plan has no valid service fee.");
}

export interface SelfPrepareInput { name: string; symbol: string; uri: string; creator: string; mint: string; devBuySol: number }

/** Validates, quotes the service fee, dry-runs the exact create transaction and returns the signed plan and the cost breakdown. Sends nothing. */
export async function selfPrepare(i: SelfPrepareInput): Promise<{ plan: LaunchPlan; ticket: string; breakdown: Breakdown; simNote: string }> {
  const env = getEnv();
  if (!isSelfLaunchEnabled()) throw new SelfLaunchError("Self launch is switched off on this server.");
  if (!env.TREASURY_PUBKEY) throw new SelfLaunchError("This launchpad is not fully set up yet (the platform treasury address is missing).");
  const clash = treasuryClash(i.creator, env.TREASURY_PUBKEY);
  if (clash) throw new SelfLaunchError(clash);
  const conn = connectionFor(env.NEXT_PUBLIC_SOLANA_NETWORK);
  if (await conn.getAccountInfo(new PublicKey(i.mint))) throw new SelfLaunchError("That mint address already exists. Reload the page and try again.");
  const q = await quoteServiceFee();
  const plan: LaunchPlan = {
    network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "own-wallet", creator: i.creator, mint: i.mint, name: i.name, symbol: i.symbol, uri: i.uri,
    devBuySol: i.devBuySol, shareholders: [],
    serviceFee: { lamports: q.lamports, to: env.TREASURY_PUBKEY, quoteAt: q.at, usd: q.usd, source: q.source },
  };
  const built = await buildSelfCreate(conn, { creator: new PublicKey(i.creator), mint: new PublicKey(i.mint), name: i.name, symbol: i.symbol, uri: i.uri, treasury: new PublicKey(env.TREASURY_PUBKEY), serviceFeeLamports: q.lamports });
  const sim = await simulateCost(conn, built.tx, new PublicKey(i.creator));
  const devBuyLamports = Math.round(i.devBuySol * LAMPORTS);
  const bufferLamports = i.devBuySol > 0 ? BUY_BUFFER_LAMPORTS : 0;
  const measured = !sim.err && sim.costLamports != null && sim.costLamports > q.lamports;
  const pump = measured ? (sim.costLamports as number) - q.lamports : EST_CREATE_LAMPORTS;
  const total = pump + q.lamports + devBuyLamports + bufferLamports;
  const breakdown: Breakdown = { pumpAndNetworkLamports: pump, estimated: !measured, serviceFeeLamports: q.lamports, serviceFeeUsd: q.usd, solUsd: q.solUsd, feeSource: q.source, devBuyLamports, bufferLamports, totalLamports: total, balanceLamports: sim.balance, quoteAt: q.at, quoteExpiresAt: q.at + QUOTE_TTL_MS };
  const sol = (l: number) => (l / LAMPORTS).toFixed(4);
  const net = env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "devnet" : "mainnet";
  if (sim.balance < total) throw new SelfLaunchError(`Your wallet has ${sol(sim.balance)} SOL on ${net}. This launch needs about ${sol(total)} SOL in total (pump.fun and network ${sol(pump)}, service fee ${sol(q.lamports)}${devBuyLamports ? `, dev buy ${sol(devBuyLamports)}` : ""}). Add about ${sol(total - sim.balance + 1_000_000)} SOL and press the button again.`);
  if (sim.err) throw new SelfLaunchError(`The dry run of the launch failed: ${JSON.stringify(sim.err).slice(0, 160)}. Nothing was sent. Try again, or change the name or ticker.`);
  const simNote = `Dry run passed (${sim.unitsConsumed ?? "?"} compute units). Nothing has been sent.`;
  return { plan, ticket: signApproval(plan, env.SESSION_SECRET), breakdown, simNote };
}

export async function selfTx(plan: LaunchPlan, ticket: string | undefined, step: SelfStep): Promise<{ tx: string; bytes: number; blockhash: string }> {
  guardPlan(plan, ticket);
  const conn = connectionFor(plan.network);
  const creator = new PublicKey(plan.creator);
  if (step === "buy") {
    if (plan.devBuySol <= 0) throw new SelfLaunchError("This plan has no dev buy.");
    const d = await buildDevBuy(conn, creator, new PublicKey(plan.mint), plan.devBuySol);
    return { tx: Buffer.from(d.tx.serialize()).toString("base64"), bytes: d.bytes, blockhash: d.blockhash };
  }
  const fee = plan.serviceFee!;
  if (!quoteFresh(fee.quoteAt)) throw new SelfLaunchError("The price quote expired. Press the button to get a fresh quote, then approve again.");
  if (await conn.getAccountInfo(new PublicKey(plan.mint))) throw new SelfLaunchError("This mint already exists on-chain.");
  const built = await buildSelfCreate(conn, { creator, mint: new PublicKey(plan.mint), name: plan.name, symbol: plan.symbol, uri: plan.uri, treasury: new PublicKey(fee.to), serviceFeeLamports: fee.lamports });
  return { tx: Buffer.from(built.tx.serialize()).toString("base64"), bytes: built.bytes, blockhash: built.blockhash };
}

export interface SelfRelayResult { sig: string; creatorOnChain?: string; serviceFeePaid?: number }

export async function selfRelay(plan: LaunchPlan, ticket: string | undefined, step: SelfStep, signedB64: string): Promise<SelfRelayResult> {
  guardPlan(plan, ticket);
  const conn = connectionFor(plan.network);
  const tx = decodeTx(signedB64);
  const fee = plan.serviceFee!;
  if (step === "create") {
    // The quote may be a little older by the time the wallet has signed; allow a short grace, never a stale price.
    if (Date.now() - fee.quoteAt > QUOTE_TTL_MS + 3 * 60 * 1000) throw new SelfLaunchError("The price quote expired. Press the button to get a fresh quote, then approve again.");
    const v = verifyServiceFee(tx, { creator: plan.creator, treasury: fee.to, lamports: fee.lamports });
    if (!v.ok) throw new SelfLaunchError(v.error);
    if (!tx.message.staticAccountKeys.some((k) => k.toBase58() === plan.mint)) throw new SelfLaunchError("The transaction is not for the approved token address.");
    if (await conn.getAccountInfo(new PublicKey(plan.mint))) throw new SelfLaunchError("This mint already exists on-chain.");
    await record(plan, "creating");
    try {
      const sig = await relay(conn, tx, plan.creator);
      let creatorOnChain: string | undefined;
      try { creatorOnChain = (await new OnlinePumpSdk(conn).fetchBondingCurve(new PublicKey(plan.mint))).creator.toBase58(); } catch { /* the curve may need a moment; the signature already proves the create */ }
      await record(plan, "live", sig, undefined, `self launch, service fee ${v.paid} lamports`);
      return { sig, creatorOnChain, serviceFeePaid: v.paid };
    } catch (e) { await record(plan, "failed", undefined, undefined, e instanceof Error ? e.message : "create failed"); throw e; }
  }
  // Dev buy: only the buy, nothing that moves SOL out of the wallet at the top level.
  const nf = verifyServiceFee(tx, { creator: plan.creator, treasury: fee.to, lamports: 0 });
  if (!nf.ok) throw new SelfLaunchError("The dev buy transaction must not transfer SOL directly.");
  const sig = await relay(conn, tx, plan.creator);
  await record(plan, "live", undefined, undefined, `dev buy ${sig}`);
  return { sig };
}
