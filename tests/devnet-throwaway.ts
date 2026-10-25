// DEVNET ONLY. `fund`: sends a little devnet SOL from the devnet test treasury to a fresh throwaway wallet kept in a 0600 temp file
// (for the self-launch browser test). `return`: sends what is left back. Never prints a key. Refuses to run unless the app network is devnet.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { Connection, Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { loadTreasurySigner, sendAndConfirm } from "../src/lib/launch/execute";

const FILE = "/tmp/rakaza-selflaunch.json";
(async () => {
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "devnet") throw new Error("devnet only");
  const conn = new Connection(process.env.HELIUS_DEVNET as string, "confirmed");
  const treasury = loadTreasurySigner();
  const send = async (payer: Keypair, to: Keypair["publicKey"], lamports: number) => {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports })] }).compileToV0Message());
    tx.sign([payer]);
    return sendAndConfirm(conn, tx, blockhash, lastValidBlockHeight);
  };
  const cmd = process.argv[2];
  if (cmd === "fund") {
    const sol = Math.min(Number(process.argv[3] ?? "0.15"), 0.3);
    const kp = Keypair.generate();
    writeFileSync(FILE, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 }); chmodSync(FILE, 0o600);
    console.log("treasury balance SOL", (await conn.getBalance(treasury.publicKey)) / 1e9);
    console.log("throwaway", kp.publicKey.toBase58(), "funded", sol, "sig", await send(treasury, kp.publicKey, Math.round(sol * 1e9)));
  } else if (cmd === "return" && existsSync(FILE)) {
    const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(FILE, "utf8"))));
    const bal = await conn.getBalance(kp.publicKey);
    const back = bal - 5000; // empty the account exactly: one signature costs 5000 lamports, and a leftover below rent-exempt minimum is refused
    if (back > 0) console.log("returned lamports", back, "sig", await send(kp, treasury.publicKey, back)); else console.log("nothing to return", bal);
  } else console.log("usage: fund [sol] | return");
})().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
