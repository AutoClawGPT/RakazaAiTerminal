import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { grind, keypairJson, newKey } from "../cli/core/grind.mjs";
import { compile, expectedKeys, validatePattern } from "../cli/core/pattern.mjs";

// pattern math
assert.equal(Math.round(expectedKeys([{ end: "ab", caseSensitive: true }])), 58 * 58);
assert.equal(Math.round(expectedKeys([{ end: "ab", caseSensitive: false }])), (58 * 58) / 4);
assert.equal(Math.round(expectedKeys([{ start: "A?" }])), 58);
assert.ok(validatePattern({ start: "0" }).length === 1 && validatePattern({}).length === 1 && validatePattern({ start: "ab" }).length === 0);
const m = compile([{ start: "Ab", caseSensitive: false }, { end: "zz" }]);
assert.equal(m("aBxxxx"), 0); assert.equal(m("xxxxzz"), 1); assert.equal(m("xxxxzZ"), -1);

// keys are real, valid Solana keypairs
for (let i = 0; i < 20; i++) {
  const k = newKey();
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson(k.seed, k.pub))));
  assert.equal(kp.publicKey.toBase58(), k.addr);
}
// single and multi thread both find matches
for (const threads of [1, 3]) {
  const found = [];
  await grind({ patterns: [{ end: "x", caseSensitive: false }], threads, shouldStop: () => found.length >= 2, onFound: (f) => found.push(f) });
  assert.ok(found.length >= 2 && found.every((f) => f.addr.toLowerCase().endsWith("x")), `threads=${threads}`);
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson(found[0].seed, found[0].pub))));
  assert.equal(kp.publicKey.toBase58(), found[0].addr);
}
console.log("grind core: OK");
