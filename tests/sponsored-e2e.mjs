// DEVNET browser test of the owner /launch tab (sponsored agent flow). Needs the dev server with DEV_PREVIEW_OWNER_PAGES=true and EXECUTE_ENABLED=true.
// Usage: node tests/sponsored-e2e.mjs <feeWallet> [CA] [--launch]
import { createRequire } from "node:module";
const shotReq = createRequire(process.env.PUPPETEER_FROM ?? "/workspace/shot-tool/package.json");
const puppeteer = shotReq("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/new";
const [wallet, CAarg, flag] = process.argv.slice(2);
const CA = CAarg && !CAarg.startsWith("--") ? CAarg : "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const doLaunch = process.argv.includes("--launch");
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const pg = await b.newPage();
await pg.setViewport({ width: 1100, height: 1500 });
pg.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await pg.goto(`${BASE}/launch`, { waitUntil: "networkidle2", timeout: 90000 });
const body = async () => pg.evaluate(() => document.body.innerText);
const t = (s, ms = 90000) => pg.waitForSelector(`[data-testid="${s}"]`, { timeout: ms });
const bad = ["You 95% · Platform 5%", "Self launch →", "Check wallet and prepare", "Approve and launch", "%%", "Agent launch (free)"];
let txt = await body();
for (const s of bad) if (txt.includes(s)) throw new Error("forbidden text on /launch: " + s);
console.log("forbidden strings absent: OK");
await pg.type('[data-testid="al-ca"]', CA);
if (!(await pg.$eval('[data-testid="al-run"]', (e) => e.disabled))) throw new Error("run must wait for the fee wallet");
await pg.type('[data-testid="al-wallet-input"]', wallet);
await pg.waitForFunction(() => { const b = document.querySelector('[data-testid="al-run"]'); return b && !b.disabled; }, { timeout: 10000 });
await pg.click('[data-testid="al-run"]');
await Promise.race([t("al-ticket", 240000), t("al-err", 240000)]).catch(() => {});
await new Promise((r) => setTimeout(r, 2000));
const steps = await pg.$eval('[data-testid="al-steps"]', (e) => e.innerText).catch(() => "(no steps)");
console.log("STEPS", steps.replace(/\n/g, " | "));
txt = await body();
for (const s of bad) if (txt.includes(s)) throw new Error("forbidden text after run: " + s);
console.log("split:", await pg.$eval('[data-testid="al-split"]', (e) => e.innerText).catch(() => "n/a"));
await pg.screenshot({ path: `${SHOTS}/launch-e2e-run.png`, fullPage: true });
if (doLaunch) {
  await pg.waitForFunction(() => { const b = document.querySelector('[data-testid="al-launch"]'); return b && !b.disabled; }, { timeout: 60000 });
  console.log("launch button:", await pg.$eval('[data-testid="al-launch"]', (e) => e.innerText));
  const tk = await pg.$('[data-testid="al-ticket"]'); if (tk) await tk.click().catch(() => {});
  await pg.click('[data-testid="al-launch"]');
  const r = await Promise.race([t("al-success", 240000).then(() => "ok"), t("al-err", 240000).then(async () => "ERR " + (await pg.$eval('[data-testid="al-err"]', (e) => e.innerText)))]);
  console.log("RESULT", r);
  console.log((await pg.$eval('[data-testid="al-success"]', (e) => e.innerText).catch(() => "")).replace(/\n/g, " | "));
  await pg.screenshot({ path: `${SHOTS}/launch-e2e-done.png`, fullPage: true });
}
await b.close();
