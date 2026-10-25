import { createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";

/** The message an agent signs with its wallet to prove it controls that address. Includes the agent id, so it cannot be replayed for another agent. */
export function walletProofMessage(agentId: string, address: string): string {
  return `Rakaza: link wallet ${address} to agent ${agentId}`;
}

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Checks an ed25519 signature (base58 or base64) over the proof message. Uses Node's own crypto. */
export function verifyWalletProof(agentId: string, address: string, signature: string): boolean {
  try {
    const pub = bs58.decode(address);
    if (pub.length !== 32) return false;
    let sig: Buffer;
    const s = signature.trim();
    if (/^[0-9a-fA-F]{128}$/.test(s)) sig = Buffer.from(s, "hex");
    else if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) sig = Buffer.from(bs58.decode(s));
    else sig = Buffer.from(s, "base64");
    if (sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(pub)]), format: "der", type: "spki" });
    return verify(null, Buffer.from(walletProofMessage(agentId, address)), key, sig);
  } catch { return false; }
}
