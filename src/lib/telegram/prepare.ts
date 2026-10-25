import "server-only";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { pinImage, pinMetadata } from "@/lib/launch/pin";
import { buildLaunch, simulateOnly } from "@/lib/launch/build-tx";
import { signApproval, type LaunchPlan } from "@/lib/launch/approval";
import { sealBytes } from "@/lib/launch/seal";
import { connectionFor } from "@/lib/launch/execute";
import { platformSplit, treasuryClash } from "@/lib/tools/splits";

export interface Prepared { plan: LaunchPlan; ticket: string; sealedMint: string; imageUrl: string; simNote: string; simOk: boolean }

/** Same steps as the Launch tab's prepare button (sponsored mode, 70/30): pin, build both transactions, dry-run the first, sign an approval ticket. Sends nothing. */
export async function prepareSponsored(i: { name: string; ticker: string; description: string; image: Uint8Array; links?: { website?: string; twitter?: string; telegram?: string }; feeWallet: string; devBuySol: number }): Promise<Prepared> {
  const env = getEnv();
  if (!env.TREASURY_PUBKEY) throw new Error("The treasury address is not set (TREASURY_PUBKEY).");
  const clash = treasuryClash(i.feeWallet, env.TREASURY_PUBKEY);
  if (clash) throw new Error(clash);
  const shareholders = platformSplit(i.feeWallet, env.TREASURY_PUBKEY);
  const img = await pinImage(i.image, `${i.ticker.toLowerCase()}.png`, "image/png");
  const meta = await pinMetadata({ name: i.name, symbol: i.ticker, description: i.description, image: img.url, ...i.links });
  const mintKp = Keypair.generate();
  const plan: LaunchPlan = { network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "sponsored", creator: env.TREASURY_PUBKEY, mint: mintKp.publicKey.toBase58(), name: i.name, symbol: i.ticker, uri: meta.uri, devBuySol: Number(i.devBuySol) || 0, shareholders: shareholders.map((s) => ({ address: s.address, shareBps: s.shareBps })) };
  const conn = connectionFor(plan.network);
  const built = await buildLaunch(conn, { creator: new PublicKey(plan.creator), mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders, devBuySol: plan.devBuySol });
  const sim = await simulateOnly(conn, built.tx1);
  const simOk = !sim.err;
  const simNote = sim.err ? `The dry run failed: ${JSON.stringify(sim.err).slice(0, 160)}` : `Dry run passed (about ${sim.unitsConsumed ?? "?"} compute units).`;
  return { plan, ticket: signApproval(plan, env.SESSION_SECRET), sealedMint: sealBytes(mintKp.secretKey, env.SESSION_SECRET), imageUrl: img.url, simNote, simOk };
}
