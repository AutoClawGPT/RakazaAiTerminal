import assert from "node:assert/strict";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { buildLaunch, simulateOnly, checkInput, scratchMint } from "../src/lib/launch/build-tx";
import { platformSplit } from "../src/lib/tools/splits";

// Read-only: builds unsigned transactions and simulates them with signature checks off. Nothing is signed or sent.
(async () => {
  const url = process.env.HELIUS_MAINNET!;
  const conn = new Connection(url, "confirmed");
  // Any funded system account works as the simulated payer, because simulation does not need its signature.
  let payer: PublicKey | null = null;
  for (const c of ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV", "FNLWHjvjptzoSzCn7TuSZNfvm6bLDDzKt9YEP6MPCjtN", "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"]) {
    const info = await conn.getAccountInfo(new PublicKey(c));
    if (info && info.owner.equals(new PublicKey("11111111111111111111111111111111")) && info.lamports > 5e9) { payer = new PublicKey(c); break; }
  }
  assert.ok(payer, "found a funded system account");
  const treasury = Keypair.generate().publicKey; // stand-in for the platform treasury
  const launcher = Keypair.generate().publicKey;
  const shareholders = platformSplit(launcher.toBase58(), treasury.toBase58());

  assert.throws(() => checkInput({ creator: payer!, mint: scratchMint(), name: "", symbol: "AB", uri: "https://x.example/m.json", shareholders, devBuySol: 0 }));
  assert.throws(() => checkInput({ creator: payer!, mint: scratchMint(), name: "A", symbol: "AB", uri: "http://bad", shareholders, devBuySol: 0 }));
  assert.throws(() => checkInput({ creator: payer!, mint: scratchMint(), name: "A", symbol: "AB", uri: "https://x.example/m.json", shareholders: [{ address: launcher.toBase58(), shareBps: 5000, label: "x" }], devBuySol: 0 }));

  for (const dev of [0, 0.5]) {
    const b = await buildLaunch(conn, { creator: payer!, mint: scratchMint(), name: "Sim Coin", symbol: "SIM", uri: "https://gateway.pinata.cloud/ipfs/bafkreiexample", shareholders, devBuySol: dev });
    console.log(`dev=${dev} SOL: tx1 ${b.tx1Bytes} bytes, tx2 ${b.tx2Bytes} bytes (limit 1232)`);
    assert.ok(b.tx1Bytes <= 1232 && b.tx2Bytes <= 1232);
    const s1 = await simulateOnly(conn, b.tx1);
    console.log("  tx1 sim:", s1.err ? JSON.stringify(s1.err) : "OK", "units", s1.unitsConsumed, s1.logs.filter((l) => /Program log|failed|Error/i.test(l)).slice(-3).join(" | ").slice(0, 300));
    const s2 = await simulateOnly(conn, b.tx2);
    console.log("  tx2 sim (expected to fail before tx1 lands):", s2.err ? JSON.stringify(s2.err) : "OK");
  }
  console.log("BUILD-TX LIVE DONE");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
