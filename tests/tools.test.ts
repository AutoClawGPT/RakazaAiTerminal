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

// intent
import { parseIntent } from "../src/lib/launch/intent";
(async () => {
  const M = "AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump";
  assert.deepEqual(parseIntent(`scan ${M}`), { kind: "scan", mint: M });
  assert.deepEqual(parseIntent(`send fees to ${M}`), { kind: "split", wallet: M });
  assert.equal(parseIntent("recreate it better").kind, "draft");
  assert.equal(parseIntent("make the logo").kind, "image");
  assert.equal(parseIntent("grind a vanity address").kind, "vanity");
  assert.deepEqual(parseIntent("simulate a 2 sol dev buy"), { kind: "simulate", sol: 2 });
  assert.equal(parseIntent("ok launch it").kind, "launch");
  assert.equal(parseIntent("how are you").kind, "chat");
  console.log("INTENT TESTS PASSED");
})();

// ---- launch approval ticket ----
import { signApproval, verifyApproval, checkCaps, type LaunchPlan } from "../src/lib/launch/approval";
{
  const S = "x".repeat(40);
  const plan: LaunchPlan = { network: "devnet", mode: "sponsored", creator: "C", mint: "M", name: "N", symbol: "SY", uri: "https://u.example/1", devBuySol: 0.1, shareholders: [{ address: "A", shareBps: 7000 }, { address: "B", shareBps: 3000 }] };
  const t = signApproval(plan, S, 1000);
  assert.deepEqual(verifyApproval(t, plan, S, 2000), { ok: true });
  assert.equal(verifyApproval(t, { ...plan, devBuySol: 5 }, S, 2000).ok, false, "plan change breaks ticket");
  assert.equal(verifyApproval(t, { ...plan, shareholders: [{ address: "A", shareBps: 3000 }, { address: "B", shareBps: 7000 }] }, S, 2000).ok, false, "split change breaks ticket");
  assert.equal(verifyApproval(t, plan, S, 1000 + 11 * 60 * 1000).ok, false, "expires");
  assert.equal(verifyApproval(t, plan, "y".repeat(40), 2000).ok, false, "wrong secret");
  assert.equal(verifyApproval(undefined, plan, S).ok, false);
  assert.equal(verifyApproval("a.b", plan, S).ok, false);
  const reordered = { ...plan, shareholders: [...plan.shareholders].reverse() };
  assert.equal(verifyApproval(t, reordered, S, 2000).ok, true, "order of holders does not matter");
  assert.equal(checkCaps(plan, { maxLaunchSol: 0.5, spentTodaySol: 0, maxDailySol: 1 }), null);
  assert.ok(checkCaps({ ...plan, devBuySol: 1 }, { maxLaunchSol: 0.5, spentTodaySol: 0, maxDailySol: 1 }));
  assert.ok(checkCaps(plan, { maxLaunchSol: 0.5, spentTodaySol: 0.95, maxDailySol: 1 }));
  console.log("approval tests ok");
}

// ---- mint seal ----
import { sealBytes, openBytes } from "../src/lib/launch/seal";
{
  const S = "q".repeat(40);
  const raw = Uint8Array.from({ length: 64 }, (_, i) => i);
  const s = sealBytes(raw, S);
  assert.deepEqual(Array.from(openBytes(s, S)), Array.from(raw));
  assert.throws(() => openBytes(s, "z".repeat(40)));
  assert.throws(() => openBytes(s.slice(0, -2) + "AA", S));
  console.log("seal tests ok");
}
