import assert from "node:assert/strict";
import { Connection, Keypair, SystemProgram, TransactionMessage, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { buildLaunch } from "../src/lib/launch/build-tx";
import { checkRelayable, decodeTx } from "../src/lib/launch/relay";
import { platformSplit } from "../src/lib/tools/splits";
(async () => {
  const conn = new Connection(process.env.HELIUS_DEVNET!, "confirmed");
  const user = Keypair.generate(), mint = Keypair.generate(), treasury = Keypair.generate().publicKey;
  const b = await buildLaunch(conn, { creator: user.publicKey, mint: mint.publicKey, name: "N", symbol: "NN", uri: "https://u.example/1", shareholders: platformSplit(user.publicKey.toBase58(), treasury.toBase58()), devBuySol: 0 });
  // unsigned: must be rejected
  assert.throws(() => checkRelayable(decodeTx(Buffer.from(b.tx1.serialize()).toString("base64")), user.publicKey.toBase58()), /signatures/);
  b.tx1.sign([user, mint]); b.tx2.sign([user]);
  checkRelayable(decodeTx(Buffer.from(b.tx1.serialize()).toString("base64")), user.publicKey.toBase58());
  checkRelayable(decodeTx(Buffer.from(b.tx2.serialize()).toString("base64")), user.publicKey.toBase58());
  assert.throws(() => checkRelayable(b.tx1, Keypair.generate().publicKey.toBase58()), /fee payer/);
  // a transfer drain disguised: calls only system program, which is allowed, so check instruction content stays our job: payer-only transfer is still signed by the user. Unknown program must fail:
  const evil = new VersionedTransaction(new TransactionMessage({ payerKey: user.publicKey, recentBlockhash: b.blockhash, instructions: [{ programId: new PublicKey("Stake11111111111111111111111111111111111111"), keys: [], data: Buffer.alloc(0) }] }).compileToV0Message());
  evil.sign([user]);
  assert.throws(() => checkRelayable(evil, user.publicKey.toBase58()), /unexpected program/);
  void SystemProgram;
  console.log("RELAY TESTS PASSED");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
