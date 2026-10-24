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

// kit
import { buildMetadata, buildThread, cleanTicker, autoChecks, emptyKit, IMAGE_PLACEHOLDER } from "../src/lib/tools/kit";
assert.equal(cleanTicker(" $rkz "), "RKZ");
const kit = { ...emptyKit, name: "Rakaza", ticker: "$rkz", description: "x".repeat(400), ca: A };
const md = buildMetadata(kit);
assert.equal(md.symbol, "RKZ"); assert.equal(md.image, IMAGE_PLACEHOLDER); assert.ok(!("twitter" in md));
const th = buildThread(kit);
assert.ok(th.ok && th.posts.length === 2 && th.lengths.every((n) => n <= 280), JSON.stringify(th.lengths));
assert.equal(autoChecks(kit).meta, true); assert.equal(autoChecks(kit).image, false);
console.log("KIT TESTS PASSED");

// vanity
import { closeness, expectedKeys, matcher, tierFor, validatePattern } from "../src/lib/tools/vanity";
assert.equal(validatePattern({ start: "ab", end: "", ignoreCase: false }).ok, true);
assert.equal(validatePattern({ start: "0O", end: "", ignoreCase: false }).ok, false);
assert.equal(validatePattern({ start: "", end: "", ignoreCase: false }).ok, false);
assert.equal(validatePattern({ start: "abcdefg", end: "abcdefg", ignoreCase: false }).ok, false);
assert.equal(Math.round(expectedKeys({ start: "ab", end: "", ignoreCase: false })), 3364);
assert.equal(Math.round(expectedKeys({ start: "ab", end: "", ignoreCase: true })), 841);
assert.equal(matcher({ start: "Ab", end: "z", ignoreCase: true })("aBxxz"), true);
assert.equal(matcher({ start: "Ab", end: "z", ignoreCase: false })("aBxxz"), false);
assert.equal(closeness({ start: "ab", end: "yz", ignoreCase: false }, "abQQyz"), 1);
assert.equal(tierFor(5), "Instant"); assert.equal(tierFor(1e7), "GPU only");
console.log("VANITY TESTS PASSED");

// vault crypto
import { open as vOpen, seal as vSeal, parseSealed, newEntry, passphraseProblem } from "../src/lib/tools/vaultcrypto";
(async () => {
  assert.ok(passphraseProblem("short"));
  assert.equal(passphraseProblem("longenough"), null);
  const doc = { entries: [newEntry("test", "Addr1", "SECRET1")] };
  const s = await vSeal(doc, "correct horse");
  assert.equal(s.v, 1);
  assert.ok(!JSON.stringify(s).includes("SECRET1"));
  const back = await vOpen(parseSealed(JSON.stringify(s)), "correct horse");
  assert.equal(back.entries[0].secret, "SECRET1");
  await assert.rejects(() => vOpen(s, "wrong passwd"));
  const s2 = await vSeal(doc, "correct horse");
  assert.notEqual(s.salt, s2.salt); assert.notEqual(s.data, s2.data);
  const tampered = { ...s, data: s.data.slice(0, -4) + "AAAA" };
  await assert.rejects(() => vOpen(tampered, "correct horse"));
  assert.throws(() => parseSealed("{}"));
  await assert.rejects(() => vSeal(doc, "short"));
  console.log("VAULT CRYPTO TESTS PASSED");
})();

// pool
import { makePoolKeypair, encodeLink, decodeLink, sealResult, openResult } from "../src/lib/tools/pool";
import sodiumT from "libsodium-wrappers";
import bs58T from "bs58";
(async () => {
  const bs = (bs58T as unknown as { default?: typeof bs58T }).default ?? bs58T;
  await sodiumT.ready;
  const kp = await makePoolKeypair();
  const link = encodeLink({ v: 1, label: "team", pattern: { start: "ab", end: "", ignoreCase: false }, pk: kp.pk });
  const back = decodeLink("#pool=" + link);
  assert.equal(back.pattern.start, "ab"); assert.equal(back.pk, kp.pk);
  assert.throws(() => decodeLink("garbage"));
  assert.throws(() => decodeLink(encodeLink({ v: 1, label: "x", pattern: { start: "0O", end: "", ignoreCase: false }, pk: kp.pk })));
  const seed = sodiumT.randombytes_buf(32);
  const pub = sodiumT.crypto_sign_seed_keypair(seed).publicKey;
  const addr = bs.encode(pub); const secret = bs.encode(Uint8Array.from([...seed, ...pub]));
  const code = await sealResult(kp.pk, addr, secret, "alice");
  assert.ok(code.startsWith("GH1.") && !code.includes(secret));
  const o = await openResult(code, kp);
  assert.equal(o.address, addr); assert.equal(o.secret, secret); assert.equal(o.note, "alice");
  const other = await makePoolKeypair();
  await assert.rejects(() => openResult(code, other));
  await assert.rejects(() => openResult("nope", kp));
  const bad = await sealResult(kp.pk, addr, bs.encode(Uint8Array.from([...sodiumT.randombytes_buf(32), ...pub])));
  await assert.rejects(() => openResult(bad, kp));
  console.log("POOL TESTS PASSED");
})();
