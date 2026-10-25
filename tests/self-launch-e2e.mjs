// DEVNET browser test of the whole /self-launch agentic flow (connect, scan, River, image, IPFS, quote, confirm, launch) with a fake Phantom wallet backed by a throwaway devnet key (0600 temp file made by tests/devnet-throwaway.ts fund).
// The key is read here only to sign in this process. It is never printed. Usage: BASE=http://localhost:3200 node tests/self-launch-e2e.mjs [dev-buy-sol] [token CA to study]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const req = createRequire(new URL("../package.json", import.meta.url));
const shotReq = createRequire(process.env.PUPPETEER_FROM ?? "/workspace/shot-tool/package.json");
const puppeteer = shotReq("puppeteer-core");
const { Keypair, VersionedTransaction } = req("@solana/web3.js");
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("/tmp/rakaza-selflaunch.json", "utf8"))));
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/new";
const dev = process.argv[2] ?? "0";
const CA = process.argv[3] ?? "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
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
const t = (s, ms = 60000) => pg.waitForSelector(`[data-testid="${s}"]`, { timeout: ms });
const txt = async (s) => pg.$eval(`[data-testid="${s}"]`, (e) => e.textContent);
// 0. the page must be the self tab only: no sponsored wallet panel, no 70/30 launch row
if (await pg.$('[data-testid="al-wallet"]')) throw new Error("sponsored wallet panel on /self-launch");
// 1. connect first: the run button is disabled until a wallet is connected
await pg.waitForSelector('[data-testid="al-run"]');
if (!(await pg.$eval('[data-testid="al-run"]', (e) => e.disabled))) throw new Error("run button must be disabled before connecting");
await (await t("connect-phantom")).click();
await t("self-addr", 30000);
const addr = await txt("self-addr");
console.log("connected wallet", addr);
await pg.screenshot({ path: `${SHOTS}/self-e2e-1-connected.png` });
// 2. paste the CA and run the agent
await pg.type('[data-testid="al-ca"]', CA);
await pg.click('[data-testid="al-run"]');
const t0 = Date.now();
const stage = await Promise.race([
  t("self-stage", 240000).then(() => "stage"),
  t("al-err", 240000).then(async () => "ERR: " + (await txt("al-err"))),
]);
console.log("agent", stage, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (stage !== "stage") { await pg.screenshot({ path: `${SHOTS}/self-e2e-fail.png`, fullPage: true }); process.exit(1); }
console.log("steps", (await pg.$eval('[data-testid="al-steps"]', (e) => e.innerText)).replace(/\n/g, " | "));
console.log("kit", await txt("al-kit-count"));
// 3. options: dev buy, vanity/mint box present, backup download present
if (Number(dev) > 0) { await pg.$eval('[data-testid="sl-dev"]', (e) => { e.value = ""; }); await pg.type('[data-testid="sl-dev"]', dev); }
await t("sl-mint-box"); await t("sl-key-download");
// 3b. the free image limit can be used up for this wallet: fall back to uploading a picture
if (await pg.$eval('[data-testid="sl-why"]', (e) => /image/i.test(e.innerText)).catch(() => false)) {
  console.log("no generated image (limit or error): uploading a picture instead");
  await (await pg.$('[data-testid="sl-file"]')).uploadFile("/tmp/test-token.png");
  await pg.waitForFunction(() => { const b = document.querySelector('[data-testid="sl-save"]'); return b && !b.disabled; }, { timeout: 30000 });
  await pg.click('[data-testid="sl-save"]');
  await pg.waitForFunction(() => !/Uploading/.test(document.querySelector('[data-testid="sl-save"]')?.innerText || ""), { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
}
// 4. quote and breakdown
await pg.click('[data-testid="sl-quote"]');
const q = await Promise.race([t("sl-breakdown", 90000).then(() => "ok"), t("sl-err", 90000).then(async () => "ERR: " + (await txt("sl-err")))]).catch(async () => "TIMEOUT: " + (await pg.$eval('[data-testid="self-stage"]', (e) => e.innerText)).slice(0, 1500));
if (q !== "ok") { console.log("QUOTE", q); await pg.screenshot({ path: `${SHOTS}/self-e2e-fail.png`, fullPage: true }); process.exit(1); }
console.log("breakdown", (await pg.$eval('[data-testid="sl-breakdown"]', (e) => e.innerText)).replace(/\n/g, " | "));
console.log("service fee row", await txt("sl-b-fee"), "| total", await txt("sl-b-total"));
// launch is refused until the user confirms
if (!(await pg.$eval('[data-testid="sl-launch"]', (e) => e.disabled))) throw new Error("launch must be disabled before confirming");
await pg.click('[data-testid="sl-confirm"]');
await pg.screenshot({ path: `${SHOTS}/self-e2e-2-quote.png`, fullPage: true });
// 5. launch
await pg.click('[data-testid="sl-launch"]');
const t1 = Date.now();
const res = await Promise.race([
  t("sl-result", 300000).then(() => "ok"),
  t("sl-err", 300000).then(async () => "ERR: " + (await txt("sl-err")).slice(0, 400)),
]);
console.log("result", res, `${((Date.now() - t1) / 1000).toFixed(0)}s`);
if (res === "ok") {
  console.log("mint", await txt("sl-mint"), "\ncreator", await txt("sl-creator"), "\nsplit", await txt("sl-result-split"), "\nfee", await txt("sl-fee-paid"));
  console.log("creator==wallet", (await txt("sl-creator")) === addr);
}
await pg.screenshot({ path: `${SHOTS}/self-e2e-3-after.png`, fullPage: true });
await b.close();
process.exit(res === "ok" ? 0 : 1);
