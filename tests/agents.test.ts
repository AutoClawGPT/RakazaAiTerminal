import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import bs58 from "bs58";
import { checkHandle, handleFromName, normalizeHandle, RESERVED_HANDLES } from "../src/lib/agents/handle";
import { avatarSvg, bannerSvg } from "../src/lib/agents/art";
import { verifyWalletProof, walletProofMessage } from "../src/lib/agents/wallet-proof";
import { signAgentSession, verifyAgentSession } from "../src/lib/agents/session";
import { evaluateTweet, fetchTweet, newVerifyCode, normalizeXUsername, parseStatusUrl, tweetIntentUrl, verifyTweetText, verifyXPost } from "../src/lib/agents/verify-x";
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
const PROFILE = "https://rakaza-ai-terminal.vercel.app/agents/alice_ai";
const want = { username: "alice", code, handle: "alice_ai" };
const tw = (o: Partial<{ author: string; text: string; urls: string[] }> = {}) => ({ author: "alice", text: `Verifying my agent on Rakaza. ${code} https://t.co/abc`, urls: [PROFILE], ...o });
assert.ok(evaluateTweet(tw(), want, "rakaza-ai-terminal.vercel.app").ok);
assert.ok(evaluateTweet(tw({ author: "ALICE" }), want).ok, "username is case blind");
assert.ok(!evaluateTweet(tw({ author: "bob" }), want).ok, "wrong author");
assert.ok(!evaluateTweet(tw({ text: "no code here" }), want).ok, "wrong code");
assert.ok(!evaluateTweet(tw({ urls: ["https://example.com/agents/alice_ai"] }), want, "rakaza-ai-terminal.vercel.app").ok, "wrong host");
assert.ok(!evaluateTweet(tw({ urls: [] }), want).ok, "no profile link");
assert.equal(normalizeXUsername("@Alice_1"), "Alice_1");
assert.equal(normalizeXUsername("https://x.com/alice/"), "alice");
assert.equal(normalizeXUsername("not valid!"), null);
assert.match(verifyTweetText("Bot", code, PROFILE), new RegExp(`${code}[\\s\\S]*${PROFILE}`));
assert.ok(tweetIntentUrl("a b").startsWith("https://x.com/intent/post?text=a%20b"));

type Route = { match: RegExp; status: number; body?: unknown; headers?: Record<string, string> };
const router = (routes: Route[]) => (async (u: string | URL | Request) => {
  const url = String(u);
  const r = routes.find((x) => x.match.test(url));
  if (!r) throw new Error("net down " + url);
  return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
}) as unknown as typeof fetch;
const SYN = /cdn\.syndication\.twimg\.com/, OEM_X = /publish\.x\.com\/oembed/, OEM_T = /publish\.twitter\.com\/oembed/;
const synBody = (o: { name?: string; text?: string; link?: string } = {}) => ({ text: o.text ?? `Verifying my agent on Rakaza. ${code} https://t.co/abc`, user: { screen_name: o.name ?? "alice" }, entities: { urls: [{ url: "https://t.co/abc", expanded_url: o.link ?? PROFILE, display_url: "rakaza-ai-terminal.vercel.app/agents/alice_ai" }] } });
const input = (over: Partial<{ postUrl: string; username: string }> = {}) => ({ postUrl: "https://x.com/alice/status/1234567890", username: "@alice", code, handle: "alice_ai", host: "rakaza-ai-terminal.vercel.app", ...over });
const oemBody = { author_url: "https://twitter.com/alice", html: `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Verifying my agent on Rakaza.<br>${code}<br><a href="https://t.co/abc">rakaza-ai-terminal.vercel.app/agents/alice_ai</a></p>&mdash; Alice (@alice)</blockquote>` };
(async () => {
  // syndication path
  assert.deepEqual(await verifyXPost(input(), router([{ match: SYN, status: 200, body: synBody() }])), { state: "verified", xHandle: "alice" });
  // falls back to oEmbed and resolves the t.co short link
  assert.deepEqual(await verifyXPost(input(), router([{ match: SYN, status: 500 }, { match: OEM_X, status: 200, body: oemBody }, { match: /t\.co\/abc/, status: 301, headers: { location: PROFILE } }])), { state: "verified", xHandle: "alice" });
  // last fallback: the old twitter.com oEmbed host
  assert.equal((await verifyXPost(input(), router([{ match: OEM_T, status: 200, body: oemBody }, { match: /t\.co\/abc/, status: 301, headers: { location: PROFILE } }]))).state, "verified");
  // wrong user, wrong code, no link: clear failures, never verified
  const f1 = await verifyXPost(input({ username: "bob" }), router([{ match: SYN, status: 200, body: synBody() }]));
  assert.equal(f1.state, "failed"); assert.match((f1 as { message: string }).message, /@alice but you said @bob/);
  const f2 = await verifyXPost(input(), router([{ match: SYN, status: 200, body: synBody({ text: "hello" }) }]));
  assert.equal(f2.state, "failed"); assert.match((f2 as { message: string }).message, /code/);
  const f3 = await verifyXPost(input(), router([{ match: SYN, status: 200, body: synBody({ link: "https://example.com/" }) }]));
  assert.equal(f3.state, "failed"); assert.match((f3 as { message: string }).message, /agent link/);
  const f4 = await verifyXPost(input(), router([{ match: SYN, status: 200, body: synBody({ name: "mallory" }) }]));
  assert.equal(f4.state, "failed", "post from another account");
  // post not found or private
  assert.equal((await verifyXPost(input(), router([{ match: SYN, status: 404 }, { match: OEM_X, status: 404 }, { match: OEM_T, status: 404 }]))).state, "failed");
  // X unreachable: pending (retry), not failed
  const pend = await verifyXPost(input(), (async () => { throw new Error("net"); }) as unknown as typeof fetch);
  assert.equal(pend.state, "pending"); assert.match((pend as { message: string }).message, /again/);
  assert.equal((await verifyXPost(input(), router([{ match: SYN, status: 503 }, { match: OEM_X, status: 503 }, { match: OEM_T, status: 503 }]))).state, "pending");
  // bad input
  assert.equal((await verifyXPost(input({ postUrl: "nope" }))).state, "failed");
  assert.equal((await verifyXPost(input({ username: "!!" }))).state, "failed");

  // REAL public post, no key: proves the parser against X itself. Skipped quietly when the box has no network.
  const real = await fetchTweet("https://x.com/jack/status/20");
  if (real.kind === "tweet") { assert.equal(real.tweet.author.toLowerCase(), "jack"); assert.match(real.tweet.text, /setting up my twttr/i); console.log("real tweet parsed:", real.tweet.author, JSON.stringify(real.tweet.text)); }
  else console.log("real tweet check skipped (no network):", real.kind);

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
