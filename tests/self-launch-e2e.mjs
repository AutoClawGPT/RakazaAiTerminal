// DEVNET browser test of /self-launch with a fake Phantom wallet backed by a throwaway devnet key (0600 temp file made by tests/devnet-throwaway.ts fund).
// The key is read here only to sign in this process. It is never printed. Usage: BASE=http://localhost:3200 node tests/self-launch-e2e.mjs [dev-buy-sol]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const req = createRequire(new URL("../package.json", import.meta.url));
const shotReq = createRequire(process.env.PUPPETEER_FROM ?? "/workspace/shot-tool/package.json");
const puppeteer = shotReq("puppeteer-core");
const { Keypair, VersionedTransaction } = req("@solana/web3.js");
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("/tmp/rakaza-selflaunch.json", "utf8"))));
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/new";
const dev = process.argv[2] ?? "0.01";
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const pg = await b.newPage();
await pg.setViewport({ width: 1100, height: 1400 });
pg.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await pg.exposeFunction("__sign", (bytes) => { const tx = VersionedTransaction.deserialize(Uint8Array.from(bytes)); tx.sign([kp]); return Array.from(tx.serialize()); });
await pg.evaluateOnNewDocument((pk) => {
  const publicKey = { toBytes: () => Uint8Array.from(pk.bytes), toBase58: () => pk.b58, toString: () => pk.b58 };
  const p = { isPhantom: true, isConnected: false, publicKey: null,
    connect: async () => { p.isConnected = true; p.publicKey = publicKey; return { publicKey }; },
    disconnect: async () => { p.isConnected = false; p.publicKey = null; },
    on() {}, off() {}, removeListener() {},
    signTransaction: async (tx) => { const out = await window.__sign(Array.from(tx.serialize())); return tx.constructor.deserialize(Uint8Array.from(out)); },
    signAllTransactions: async (txs) => Promise.all(txs.map((t) => p.signTransaction(t))) };
  window.isPhantomInstalled = true; window.phantom = { solana: p };
}, { bytes: Array.from(kp.publicKey.toBytes()), b58: kp.publicKey.toBase58() });
await pg.goto(`${BASE}/self-launch`, { waitUntil: "networkidle2", timeout: 90000 });
const t = (s) => pg.waitForSelector(`[data-testid="${s}"]`, { timeout: 60000 });
await pg.type('[data-testid="sl-name"]', "E2E Self Launch");
await pg.type('[data-testid="sl-ticker"]', "E2ESL");
await pg.type('[data-testid="sl-desc"]', "Devnet end to end test of the public self launch page.");
await (await t("sl-file")).uploadFile("/tmp/e2e.png");
await pg.waitForFunction(() => document.querySelector('[data-testid="sl-preview"] img'), { timeout: 20000 });
await pg.$eval('[data-testid="sl-dev"]', (e) => { e.value = ""; });
await pg.type('[data-testid="sl-dev"]', dev);
await (await t("connect-phantom")).click();
await pg.waitForFunction(() => document.querySelector('[data-testid="self-addr"]') || document.querySelector('[data-testid="self-err"]'), { timeout: 30000 });
const cerr = await pg.$('[data-testid="self-err"]');
if (cerr) { console.log("CONNECT ERROR:", await pg.$eval('[data-testid="self-err"]', (e) => e.textContent)); await pg.screenshot({ path: `${SHOTS}/self-launch-connect-fail.png` }); process.exit(2); }
const addr = await pg.$eval('[data-testid="self-addr"]', (e) => e.textContent);
console.log("connected wallet", addr);
await pg.click('[data-testid="self-confirm"]');
await pg.screenshot({ path: `${SHOTS}/self-launch-before.png`, fullPage: true });
await pg.click('[data-testid="self-go"]');
const t0 = Date.now();
const res = await Promise.race([
  pg.waitForSelector('[data-testid="sl-result"]', { timeout: 300000 }).then(() => "ok"),
  pg.waitForSelector('[data-testid="self-err"]', { timeout: 300000 }).then(async () => "ERR: " + (await pg.$eval('[data-testid="self-err"]', (e) => e.textContent))),
]);
console.log("result", res, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (res === "ok") {
  const txt = async (s) => pg.$eval(`[data-testid="${s}"]`, (e) => e.textContent);
  console.log("mint", await txt("sl-mint"), "\ncreator", await txt("sl-creator"), "\nsplit", await txt("sl-result-split"));
  console.log("creator==wallet", (await txt("sl-creator")) === addr);
  console.log("steps", (await pg.$eval('[data-testid="self-steps"]', (e) => e.innerText)).replace(/\n/g, " | "));
}
await pg.screenshot({ path: `${SHOTS}/self-launch-after.png`, fullPage: true });
await b.close();
process.exit(res === "ok" ? 0 : 1);
