import { PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";

/**
 * The pump SDK simulates a read-only call and needs a signer account that exists on the network.
 * Its built-in default does not exist on devnet, which made every distributable amount read as zero.
 * The platform treasury always exists and is funded, so it is used instead. Nothing is signed or sent.
 */
export function simulationSigner(): PublicKey | undefined {
  const t = getEnv().TREASURY_PUBKEY;
  return t ? new PublicKey(t) : undefined;
}
