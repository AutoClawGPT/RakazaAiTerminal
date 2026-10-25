// Headless check of /vanity: progress/speed increase while grinding, found secret verifies against address, thread control stable.
import { createRequire } from "node:module";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 200)));
p.on("console", (m) => { if (["error", "warning"].includes(m.type())) errs.push(m.type() + " " + m.text().slice(0, 300)); });
await p.goto(`${BASE}/vanity`, { waitUntil: "networkidle0", timeout: 60000 });
const labels = [];
const lab = () => p.$eval("label[for=v-threads]", (e) => e.textContent);
labels.push(await lab());
await new Promise((r) => setTimeout(r, 1500));
labels.push(await lab());
// long pattern to observe progress while running
await p.type("#v-start", "Rkzzz");
await p.click("button.rk-btn-honey");
const samples = [];
for (let i = 0; i < 7; i++) {
  await new Promise((r) => setTimeout(r, i === 0 ? 400 : 1000)); // first sample shortly after start
  samples.push(await p.evaluate(() => ({ total: document.querySelector("[data-testid=vanity-total]").textContent, speed: document.querySelector("[data-testid=vanity-total]").closest("dl").querySelectorAll("dd")[1].textContent })));
}
await p.click("button.rk-btn-white");
// short prefix, found
await p.reload({ waitUntil: "networkidle0" });
await p.type("#v-start", "Ab");
await p.click("#v-start ~ *", {}).catch(() => {});
const ic = await p.$("input[type=checkbox]");
await ic.click();
await p.click("button.rk-btn-honey");
await p.waitForSelector("[data-testid=vanity-addr]", { timeout: 60000 });
const addr = await p.$eval("[data-testid=vanity-addr]", (e) => e.textContent);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Show secret/.test(x.textContent)).click());
const secret = await p.$eval("[data-testid=vanity-secret]", (e) => e.textContent);
const total = await p.$eval("[data-testid=vanity-total]", (e) => e.textContent);
const nacl = await import("node:crypto");
const bs58 = (await import("/workspace/RakazaTokenization/app/node_modules/bs58/src/esm/index.js").catch(() => import("bs58"))).default;
const sec = bs58.decode(secret);
const pk = nacl.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(sec.slice(0, 32))]), format: "der", type: "pkcs8" });
const derived = nacl.createPublicKey(pk).export({ format: "der", type: "spki" }).slice(-32);
const verifies = bs58.encode(derived) === addr && bs58.encode(sec.slice(32)) === addr;
const nums = samples.map((x) => Number(x.total.replace(/,/g, "")));
const increasing = nums.every((n, i) => i === 0 ? n > 0 : n > nums[i - 1]);
const speedOk = samples.every((x) => Number(x.speed.replace(/[^0-9]/g, "")) > 0);
const labelStable = labels[0] === labels[1] && !errs.some((e) => /hydrat/i.test(e));
// other core counts
const fixed = {};
for (const n of [2, 4, 16]) {
  const q = await b.newPage();
  await q.evaluateOnNewDocument((n) => Object.defineProperty(navigator, "hardwareConcurrency", { get: () => n }), n);
  await q.goto(`${BASE}/vanity`, { waitUntil: "networkidle0" });
  fixed[n] = await q.$eval("label[for=v-threads]", (e) => e.textContent);
}
console.log(JSON.stringify({ labels, fixed, samples, addr, total, verifies, increasing, speedOk, labelStable, errs }, null, 1));
if (!(increasing && speedOk && verifies && labelStable)) process.exitCode = 1;
await b.close();
