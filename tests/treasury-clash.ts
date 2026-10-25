/** Offline test (no network, no keys): the fee wallet may never equal the platform treasury, and no raw "duplicate address" text can reach a user. Also the Launch Kit ticks. */
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { TREASURY_CLASH_MSG, platformSplit, selfSplit, treasuryClash, validateSplit } from "../src/lib/tools/splits";
import { autoKit, type AutoState } from "../src/lib/launch/auto-kit";

const T = Keypair.generate().publicKey.toBase58();
const U = Keypair.generate().publicKey.toBase58();

// 1. the clash is caught before any split is built
assert.equal(treasuryClash(T, T), TREASURY_CLASH_MSG);
assert.equal(treasuryClash(` ${T} `, T), TREASURY_CLASH_MSG);
assert.equal(treasuryClash(U, T), null);
assert.equal(treasuryClash("", T), null);
assert.equal(treasuryClash(U, undefined), null);
assert.match(TREASURY_CLASH_MSG, /Use a different wallet than the platform treasury/);

// 2. if a clashing split is ever built anyway, the validator message is friendly (never "Row 2: duplicate address.")
for (const rows of [platformSplit(T, T), selfSplit(T, T)]) {
  const v = validateSplit(rows);
  assert.equal(v.ok, false);
  const text = JSON.stringify(v);
  assert.ok(!/duplicate address/i.test(text), text);
  assert.match(text, /already in the list/);
}
// ...and good splits stay valid, with the right labels and percentages
const s70 = platformSplit(U, T);
assert.deepEqual(s70.map((r) => r.shareBps), [7000, 3000]);
assert.equal(validateSplit(s70).ok, true);
const s95 = selfSplit(U, T);
assert.deepEqual(s95.map((r) => r.shareBps), [9500, 500]);
assert.equal(validateSplit(s95).ok, true);
assert.equal(s95[0].address, U);
assert.equal(s95[1].address, T);

// 3. Launch Kit: ticks are earned. Failed prepare leaves lab/splits/backup pending (5/9 there is correct); success ticks them.
const base: AutoState = { vampScanned: true, groundMint: null, riskLevel: "low", imageUrl: "https://i.example/x.png", uri: "https://u.example/x.json", name: "Name", ticker: "TICK", description: "d", thread: ["post one CA"], dryRunOk: false, splitChecked: false, mintSealed: false };
const done = (s: AutoState) => autoKit(s).filter((k) => k.state === "done").map((k) => k.id);
assert.equal(done(base).length, 5, "before prepare: shield, image, meta, thread, radar");
const prepared = { ...base, dryRunOk: true, splitChecked: true, mintSealed: true };
assert.equal(done(prepared).length, 8, "after prepare: + backup, lab, splits");
assert.equal(autoKit(prepared).find((k) => k.id === "grind")?.state, "optional");
assert.equal(done({ ...prepared, groundMint: Keypair.generate().publicKey.toBase58() }).length, 9);
assert.equal(autoKit({ ...prepared, riskLevel: "high" }).find((k) => k.id === "radar")?.state, "pending");
console.log("TREASURY CLASH + KIT TESTS PASSED");
