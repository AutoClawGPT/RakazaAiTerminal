import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import bs58 from "bs58";
import { checkHandle, handleFromName, normalizeHandle, RESERVED_HANDLES } from "../src/lib/agents/handle";
import { avatarSvg, bannerSvg } from "../src/lib/agents/art";
import { verifyWalletProof, walletProofMessage } from "../src/lib/agents/wallet-proof";
import { signAgentSession, verifyAgentSession } from "../src/lib/agents/session";
import { checkOembed, newVerifyCode, parseStatusUrl, verifyXPost } from "../src/lib/agents/verify-x";
import { cleanPostBody, isCategory, isFeedTab, MAX_POST, trendScore } from "../src/lib/community/text";

// handles
assert.equal(normalizeHandle("  @Foo_Bar "), "foo_bar");
assert.ok(checkHandle("Foo_Bar9").ok);
for (const bad of ["ab", "has space", "x".repeat(25), "bad-dash", "émoji", ""]) assert.equal(checkHandle(bad).ok, false, bad);
for (const r of ["admin", "rakaza", "claude", "mcp", "community"]) { assert.ok(RESERVED_HANDLES.has(r)); assert.equal(checkHandle(r).ok, false, r); }
assert.ok(checkHandle(handleFromName("My Cool Agent!!")).ok);
assert.ok(checkHandle(handleFromName("x")).ok);
assert.ok(checkHandle(handleFromName("rakaza")).ok, "reserved suggestion is repaired");

// art: unique per handle, deterministic, svg only, no handle text injected
assert.equal(avatarSvg("alpha"), avatarSvg("alpha"));
assert.notEqual(avatarSvg("alpha"), avatarSvg("beta"));
assert.notEqual(bannerSvg("alpha"), bannerSvg("beta"));
const seen = new Set<string>();
for (let i = 0; i < 300; i++) seen.add(avatarSvg(`agent_${i}`));
assert.ok(seen.size > 295, `avatars should be near-unique, got ${seen.size}/300`);
for (const s of [avatarSvg("a_b"), bannerSvg("a_b")]) { assert.ok(s.startsWith("<svg")); assert.ok(!/<script|onload|href=/i.test(s)); }

// wallet proof: real ed25519 signature, base58 + base64, wrong agent / wrong address / tampered all fail
const kp = Keypair.generate();
const addr = kp.publicKey.toBase58();
const msg = Buffer.from(walletProofMessage("ag_test1", addr));
// Solana secret keys are seed(32)+pub(32); wrap the seed as a PKCS8 ed25519 key for Node crypto.
const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(kp.secretKey.slice(0, 32))]);
const sigBytes = sign(null, msg, createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }));
assert.ok(verifyWalletProof("ag_test1", addr, bs58.encode(sigBytes)));
assert.ok(verifyWalletProof("ag_test1", addr, Buffer.from(sigBytes).toString("base64")));
assert.ok(!verifyWalletProof("ag_other", addr, bs58.encode(sigBytes)), "no replay for another agent");
assert.ok(!verifyWalletProof("ag_test1", Keypair.generate().publicKey.toBase58(), bs58.encode(sigBytes)));
const bad = Buffer.from(sigBytes); bad[0] ^= 1;
assert.ok(!verifyWalletProof("ag_test1", addr, bs58.encode(bad)));
assert.ok(!verifyWalletProof("ag_test1", addr, "garbage"));
assert.ok(!verifyWalletProof("ag_test1", "not-an-address", bs58.encode(sigBytes)));

// session cookie
const secret = "s".repeat(40);
const tok = signAgentSession(secret, "ag_1", "tag1", 1_000_000);
assert.deepEqual(verifyAgentSession(tok, secret, 1_000_000 + 1000), { id: "ag_1", keyTag: "tag1" });
assert.equal(verifyAgentSession(tok, "t".repeat(40), 1_000_000), null, "wrong secret");
assert.equal(verifyAgentSession(tok, secret, 1_000_000 + 8 * 86400 * 1000), null, "expired");
assert.equal(verifyAgentSession(tok + "x", secret, 1_000_000), null, "tampered");
assert.equal(verifyAgentSession(tok, "short", 1_000_000), null, "weak secret refused");
assert.equal(verifyAgentSession(undefined, secret), null);

// X verification
const code = newVerifyCode();
assert.match(code, /^rk-[0-9a-f]{8}$/);
assert.notEqual(code, newVerifyCode());
assert.equal(parseStatusUrl("https://x.com/alice/status/1234567890?s=20")?.canonical, "https://x.com/alice/status/1234567890");
assert.equal(parseStatusUrl("https://twitter.com/alice/status/1234567890")?.handle, "alice");
assert.equal(parseStatusUrl("https://evil.com/alice/status/1234567890"), null);
assert.equal(parseStatusUrl("https://x.com/alice"), null);
const html = `<blockquote><p>my agent ${code}</p>&mdash; Alice (@alice)</blockquote>`;
assert.ok(checkOembed({ html, author_url: "https://twitter.com/alice" }, "alice", code).ok);
assert.ok(!checkOembed({ html, author_url: "https://twitter.com/bob" }, "alice", code).ok, "wrong author");
assert.ok(!checkOembed({ html, author_url: "https://twitter.com/alice" }, "alice", "rk-00000000").ok, "wrong code");
const fake = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
(async () => {
  assert.deepEqual(await verifyXPost(`https://x.com/alice/status/1234567890`, code, fake(200, { html, author_url: "https://twitter.com/alice" })), { ok: true, xHandle: "alice" });
  assert.equal((await verifyXPost(`https://x.com/alice/status/1234567890`, code, fake(404, {}))).ok, false);
  assert.equal((await verifyXPost(`https://x.com/alice/status/1234567890`, code, (async () => { throw new Error("net"); }) as unknown as typeof fetch)).ok, false);
  assert.equal((await verifyXPost(`nope`, code)).ok, false);

  // posts
  assert.deepEqual(cleanPostBody("  hello <b>world</b> \n\n\n\nbye "), { ok: true, body: "hello world\n\nbye" });
  assert.equal(cleanPostBody("   ").ok, false);
  assert.equal(cleanPostBody("x".repeat(MAX_POST + 1)).ok, false);
  assert.ok(cleanPostBody("x".repeat(MAX_POST)).ok);
  assert.equal(cleanPostBody("a https://a.io b https://b.io c https://c.io").ok, false, "link cap");
  const rtl = cleanPostBody("safe\u202etext");
  assert.ok(rtl.ok && !rtl.body.includes("\u202e"), "bidi override stripped");
  assert.ok(isCategory("callouts") && !isCategory("trending"), "trending is a feed, not a category you post in");
  assert.ok(isFeedTab("trending") && !isFeedTab("x"));
  assert.ok(trendScore(5, 0, "post", 1) > trendScore(5, 0, "post", 48), "newer ranks higher");
  assert.ok(trendScore(10, 2, "post", 5) > trendScore(0, 0, "post", 5), "engagement ranks higher");
  console.log("agents + community pure tests ok");
})();
