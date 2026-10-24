import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { exportSplit, platformSplit, splitEvenly, validateSplit } from "../src/lib/tools/splits";
import { attackerTimes, compareAddresses, humanTime, shieldScore } from "../src/lib/tools/shield";
import { simulate } from "../src/lib/tools/curve";

const A = Keypair.generate().publicKey.toBase58();
const B = Keypair.generate().publicKey.toBase58();

// splits
assert.deepEqual(splitEvenly(3), [3334, 3333, 3333]);
assert.equal(splitEvenly(7).reduce((a, b) => a + b, 0), 10000);
assert.equal(validateSplit(platformSplit(A, B)).ok, true);
assert.equal(validateSplit([{ address: A, shareBps: 7000 }, { address: A, shareBps: 3000 }]).ok, false);
assert.equal(validateSplit([{ address: A, shareBps: 6999 }, { address: B, shareBps: 3000 }]).ok, false);
assert.equal(validateSplit([{ address: "nope", shareBps: 10000 }]).ok, false);
assert.equal(validateSplit(Array.from({ length: 11 }, () => ({ address: A, shareBps: 1 }))).ok, false);
assert.ok(JSON.parse(exportSplit(A, platformSplit(A, B))).shareholders.length === 2);

// shield
assert.deepEqual(["2", "4", "6", "8"].map((n) => shieldScore(+n).grade), ["Wide open", "Cloneable", "Solid", "Fortress"].map((_, i) => shieldScore([2, 4, 6, 8][i]).grade));
console.log("shield n=2..8:", [2, 3, 4, 5, 6, 7, 8].map((n) => `${n}:${shieldScore(n).score}/${shieldScore(n).grade}`).join(" "));
assert.equal(shieldScore(8).grade, "Fortress");
assert.equal(shieldScore(2).grade, "Wide open");
console.log("n=4 times:", attackerTimes(4).map((a) => `${a.name} ${humanTime(a.seconds)}`).join(", "));
assert.equal(compareAddresses(A, A).verdict, "same");
assert.equal(compareAddresses(A, B).valid, true);
const fake = A.slice(0, 6) + B.slice(6, B.length - 6) + A.slice(-6);
const c = compareAddresses(A, fake);
assert.ok(c.total >= 12 && c.severity === "bad", JSON.stringify(c));
assert.equal(compareAddresses(A, "bad").valid, false);

// curve
const s = simulate([{ wallet: "Dev", sol: 1 }]);
console.log("dev 1 SOL:", s.rows[0].pct.toFixed(3) + "%", "mc", s.marketCapSol.toFixed(2), "SOL");
assert.ok(s.rows[0].pct > 3 && s.rows[0].pct < 4);
const g = simulate([{ wallet: "Dev", sol: 2 }, { wallet: "W1", sol: 20 }, { wallet: "W2", sol: 30 }, { wallet: "W3", sol: 40 }]);
assert.equal(g.graduated, true);
assert.ok(g.sold <= 793_100_000);
assert.equal(simulate([{ wallet: "Dev", sol: 0 }]).sold, 0);
console.log("ALL TOOL TESTS PASSED");
