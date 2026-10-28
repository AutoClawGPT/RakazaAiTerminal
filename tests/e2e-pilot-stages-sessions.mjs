// AI pilot stages, every route: the pilot must be the stage-1 beginner (loses all 3 lives) for a GUEST (no agent key) no matter how the player set up the brain:
// default brain, River (platform model), bring-your-own model that answers nothing (empty plan), and a "champion" planted in local storage with the expert's genes.
// Also: a stage picker is on the game's start menu (1-5 selectable, 6 locked), the AI PILOT button and the HUD show the stage, and stage 6 can never be picked as a guest.
// Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/x node tests/e2e-pilot-stages-sessions.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/pilot-fix"; mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function gf(p) {
  for (let i = 0; i < 80; i++) { try { const h = await p.$("iframe[data-testid=game-frame]"); const f = h && (await h.contentFrame()); if (f && (await f.$("#ai-button"))) return f; } catch {} await sleep(500); }
  throw new Error("game frame not ready");
}
const setups = {
  "default brain": {},
  "River (platform model)": { rz_brain_v15: JSON.stringify({ mode: "river" }) },
  "own model that answers nothing": { rz_brain_v15: JSON.stringify({ mode: "byo", byoBase: "http://127.0.0.1:9/v1", byoModel: "x", byoProtocol: "openai", byoTimeout: 500 }) },
  "champion planted with the expert genes": { rz_v2: JSON.stringify({ champion: [0.32, 0.3, 0.88, 0.15] }) },
};
async function one(label, w, h, name, ls, useWatch) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 });
  if (/localhost/.test(BASE)) await p.setExtraHTTPHeaders(ipH);
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.evaluateOnNewDocument((ls) => { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } }, ls);
  await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
  const f = await gf(p); await sleep(2500);
  const ui = await f.evaluate(() => { const g = (n) => document.querySelector(`[data-testid="stage-${n}"]`); const t = (n) => g(n) && g(n).textContent; return { n: [1, 2, 3, 4, 5, 6].filter((n) => g(n)).length, cur: [1, 2, 3, 4, 5, 6].filter((n) => g(n) && g(n).getAttribute("aria-pressed") === "true").join(), six: t(6), btn: document.getElementById("ai-button").textContent, stage: window.RakazaStages.stage() }; });
  ok(`${label} ${name}: stage picker on the start menu, stage 1 current, 6 shown locked (${JSON.stringify(ui)})`, ui.n === 6 && ui.cur === "1" && /🔒/.test(ui.six) && /STAGE 1/.test(ui.btn) && ui.stage === 1);
  if (name === "default brain") {
    await f.evaluate(() => document.querySelector('[data-testid="stage-3"]')?.click()); await sleep(400);
    let s = await f.evaluate(() => ({ st: window.RakazaStages.stage(), btn: document.getElementById("ai-button").textContent }));
    ok(`${label} guest: picking stage 3 works and shows on the AI PILOT button (${JSON.stringify(s)})`, s.st === 3 && /STAGE 3/.test(s.btn));
    await f.evaluate(() => document.querySelector('[data-testid="stage-6"]')?.click()); await sleep(300);
    s = await f.evaluate(() => window.RakazaStages.stage());
    ok(`${label} guest: stage 6 cannot be picked (${s})`, s === 3);
    const hacked = await f.evaluate(() => (window.RakazaStages.pick || (() => Promise.resolve({ ok: true })))(6).then((r) => ({ r, st: window.RakazaStages.stage() })));
    ok(`${label} guest: pick(6) refused (${JSON.stringify(hacked)})`, hacked.r.ok === false && hacked.st === 3);
    await p.screenshot({ path: `${SHOTS}/${label}-guest-picker.png` });
    await f.evaluate(() => document.querySelector('[data-testid="stage-1"]')?.click()); await sleep(300);
  }
  await f.evaluate(() => document.getElementById("ai-button").click());
  await f.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
  const lives = []; const t0 = Date.now(); let hud = "";
  while (Date.now() - t0 < Number(process.env.T ?? 300000)) {
    const s = await f.evaluate(() => { const g = window.__rz2.game; return { st: window.__rz2.state, lives: g ? g.lives : null, hud: (document.getElementById("pilot-toggle") || {}).textContent }; });
    if (s.hud) hud = s.hud;
    if (s.lives != null && lives[lives.length - 1] !== s.lives) { lives.push(s.lives); if (lives.length === 2) await p.screenshot({ path: `${SHOTS}/${label}-${name.replace(/\W+/g, "-")}-losing.png` }); }
    if (s.st !== "play") break;
    await sleep(150);
  }
  ok(`${label} ${name}: the stage-1 pilot keeps hitting things and loses lives (${lives.join(">")}) · HUD "${hud}"`, lives[0] === 3 && Math.min(...lives) <= 1 && /STAGE 1/.test(hud));
  ok(`${label} ${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}
try {
  for (const [label, w, h] of [["desktop", 1280, 900], ["phone", 390, 800]].filter((x) => !process.env.ONLY || x[0] === process.env.ONLY)) {
    const all = Object.entries(setups).filter(([n]) => !process.env.NAME || n.includes(process.env.NAME));
    for (let k = 0; k < all.length; k += 2) await Promise.all(all.slice(k, k + 2).map(([name, ls]) => one(label, w, h, name, ls))); // two at a time: the software-rendered game slows down when more run together
  }
} finally { await b.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
