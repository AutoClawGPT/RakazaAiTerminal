// Devnet: verify a self-launch on-chain. usage: node verify-self-onchain.mjs <mint> <creator>
import { Connection, PublicKey } from "@solana/web3.js";
const [mint, creator] = process.argv.slice(2);
const treasury = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY);
const c = new Connection(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
const sigs = await c.getSignaturesForAddress(new PublicKey(mint), { limit: 20 });
console.log("txs touching mint", sigs.length);
let create = null;
for (const s of sigs.reverse()) {
  const tx = await c.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx || tx.meta?.err) { console.log(" tx failed/missing", s.signature.slice(0, 8)); continue; }
  const progs = tx.transaction.message.instructions.map((i) => i.programId.toBase58());
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const tIdx = keys.indexOf(treasury.toBase58());
  const delta = tIdx >= 0 ? (tx.meta.postBalances[tIdx] - tx.meta.preBalances[tIdx]) / 1e9 : 0;
  console.log(" tx", s.signature.slice(0, 12), "signer", keys[0] === creator ? "creator" : keys[0], "treasury delta", delta, "feeSharing", progs.includes(FEES.toBase58()), "pump", progs.includes(PUMP.toBase58()));
  if (!create && delta > 0) create = { delta, sig: s.signature };
}
console.log("RESULT treasury got service fee:", create ? create.delta + " SOL" : "NO");
const acc = await c.getAccountInfo(new PublicKey(mint));
console.log("mint exists", !!acc);
