// DEVNET ONLY. Makes a token earn creator fees with a small buy from a throwaway wallet funded by the devnet treasury,
// then returns the leftover SOL. Never prints secrets. Refuses to run unless the app network is devnet.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { loadTreasurySigner, sendAndConfirm } from "../src/lib/launch/execute";
import { buildDevBuy } from "../src/lib/launch/build-tx";

(async () => {
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "devnet") throw new Error("devnet only");
  const mint = new PublicKey(process.argv[2]);
  const buySol = Math.min(Number(process.argv[3] ?? "0.1"), 0.25);
  const conn = new Connection(process.env.HELIUS_DEVNET as string, "confirmed");
  const treasury = loadTreasurySigner();
  const reuse = process.env.REUSE_THROWAWAY === "1" && existsSync("/tmp/rakaza-throwaway.json");
  const thief = reuse ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("/tmp/rakaza-throwaway.json", "utf8")))) : Keypair.generate(); // throwaway buyer; kept only in a 0600 temp file so leftover SOL can be recovered
  if (!reuse) writeFileSync("/tmp/rakaza-throwaway.json", JSON.stringify(Array.from(thief.secretKey)), { mode: 0o600 });
  const send = async (payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []) => {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
    tx.sign([payer, ...extra]);
    return sendAndConfirm(conn, tx, blockhash, lastValidBlockHeight);
  };
  const fund = Math.round((buySol + 0.02) * 1e9);
  const s1 = reuse ? "reused" : await send(treasury, [SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: thief.publicKey, lamports: fund })]);
  console.log("funded throwaway", thief.publicKey.toBase58(), "lamports", fund, "sig", s1);
  try {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await buildDevBuy(conn, thief.publicKey, mint, buySol, 60);
    d.tx.sign([thief]);
    const s2 = await sendAndConfirm(conn, d.tx, d.blockhash, d.lastValidBlockHeight);
    console.log("buy", buySol, "SOL on", mint.toBase58(), "sig", s2);
  } catch (e) { console.log("buy failed:", e instanceof Error ? e.message.slice(0, 300) : e); }
  const left = await conn.getBalance(thief.publicKey);
  if (left > 10_000) {
    const s3 = await send(thief, [SystemProgram.transfer({ fromPubkey: thief.publicKey, toPubkey: treasury.publicKey, lamports: left - 5000 })]);
    console.log("returned", left - 5000, "lamports to treasury, sig", s3);
  }
})().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
