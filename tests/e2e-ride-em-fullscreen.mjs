// Ride 'Em fullscreen e2e: two clean modes, never a forced rotation. Desktop windowed + fullscreen, phone portrait + landscape, Fullscreen API on and off,
// orientation-change events, the in-game button and the host button, the Exit button. Usage: BASE=... SHOTS=... node tests/e2e-ride-em-fullscreen.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g3";
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.1.1` };

async function open(name, w, h, { phone = false, api = true } = {}) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.bringToFront();
  await p.setViewport({ width: w, height: h, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  p.on("pageerror", (e) => errs.push(`${name}: ${e}`));
  await p.evaluateOnNewDocument((apiOn) => {
    window.__lock = 0;
    try { if (screen.orientation) { screen.orientation.lock = () => { window.__lock++; return Promise.resolve(); }; } } catch {}
    if (!apiOn) { try { Object.defineProperty(document, "fullscreenEnabled", { get: () => false }); Element.prototype.requestFullscreen = undefined; } catch {} }
  }, api);
  await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
  await p.waitForFunction(() => { const f = document.querySelector("iframe[data-testid=game-frame]"); return f?.contentDocument?.getElementById("world") && f.contentWindow.RakazaMobile; }, { timeout: 40000, polling: 300 });
  await sleep(1500);
  return p;
}
const state = (p) => p.evaluate(() => {
  const f = document.querySelector("iframe[data-testid=game-frame]"), st = document.querySelector("[data-testid=game-stage]");
  const w = f.contentDocument.getElementById("world"), sr = st.getBoundingClientRect(), fr = f.getBoundingClientRect();
  return { vw: innerWidth, vh: innerHeight, stage: [Math.round(sr.width), Math.round(sr.height)], iframe: [Math.round(fr.width), Math.round(fr.height)], inner: [f.contentWindow.innerWidth, f.contentWindow.innerHeight], canvasCss: [parseInt(w.style.width), parseInt(w.style.height)], canvasPx: [w.width, w.height], dpr: devicePixelRatio, fs: !!document.fullscreenElement, css: st.dataset.full === "true", lock: window.__lock | 0 };
});
const matches = (s) => Math.abs(s.canvasCss[0] - s.iframe[0]) <= 2 && Math.abs(s.canvasCss[1] - s.iframe[1]) <= 2 && Math.abs(s.inner[0] - s.iframe[0]) <= 2 && Math.abs(s.inner[1] - s.iframe[1]) <= 2;
const scrollStage = (p) => p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant", block: "center" }));
const inFrameBtn = (p) => p.evaluate(() => document.querySelector("iframe[data-testid=game-frame]").contentDocument.getElementById("rzFs").click());
const fsOn = async (p) => { await sleep(1400); const s = await state(p); return s.fs || s.css; };

async function cycle(name, p, mode) {
  // windowed
  await scrollStage(p); await sleep(400);
  const w0 = await state(p);
  ok(`${name}: windowed canvas matches the stage (${w0.iframe.join("x")})`, matches(w0) && !w0.fs && !w0.css, JSON.stringify(w0));
  await p.screenshot({ path: `${SHOTS}/fs-${name}-windowed.png` });
  // enter via the host button
  await p.evaluate(() => document.querySelector("[data-testid=game-fullscreen]").click());
  ok(`${name}: host FULLSCREEN enters ${mode}`, await fsOn(p), JSON.stringify(await state(p)));
  const f1 = await state(p);
  ok(`${name}: fullscreen fills the screen and the canvas matches it (${f1.iframe.join("x")} of ${f1.vw}x${f1.vh})`, Math.abs(f1.iframe[0] - f1.vw) <= 2 && Math.abs(f1.iframe[1] - f1.vh) <= 2 && matches(f1), JSON.stringify(f1));
  ok(`${name}: ${mode === "css" ? "CSS" : "API"} fullscreen mode is the expected one`, mode === "css" ? f1.css && !f1.fs : f1.fs && !f1.css, JSON.stringify(f1));
  ok(`${name}: orientation was never locked or forced`, f1.lock === 0, `lock calls ${f1.lock}`);
  await p.screenshot({ path: `${SHOTS}/fs-${name}-fullscreen.png` });
  // orientation change while fullscreen: swap the viewport, fire the events, the canvas must follow with no distortion
  const vp = p.viewport();
  await p.setViewport({ ...vp, width: vp.height, height: vp.width }); await p.evaluate(() => window.dispatchEvent(new Event("orientationchange"))); await sleep(1300);
  const f2 = await state(p);
  ok(`${name}: after a rotate the canvas follows the screen (${f2.iframe.join("x")})`, matches(f2) && Math.abs(f2.iframe[0] - f2.vw) <= 2, JSON.stringify(f2));
  await p.screenshot({ path: `${SHOTS}/fs-${name}-fullscreen-rotated.png` });
  await p.setViewport(vp); await p.evaluate(() => window.dispatchEvent(new Event("orientationchange"))); await sleep(1000);
  // the in-game button + exit
  const exitBtn = await p.$("[data-testid=game-exit-fullscreen]");
  ok(`${name}: Exit fullscreen button is shown`, !!exitBtn);
  await p.evaluate(() => document.querySelector("[data-testid=game-exit-fullscreen]").click()); await sleep(1300);
  const w1 = await state(p);
  ok(`${name}: Exit returns to the windowed size (${w1.iframe.join("x")})`, !w1.fs && !w1.css && matches(w1) && Math.abs(w1.iframe[0] - w0.iframe[0]) <= 2 && Math.abs(w1.iframe[1] - w0.iframe[1]) <= 3, JSON.stringify({ w0: w0.iframe, w1 }));
  // in-game button enters and leaves too
  await inFrameBtn(p);
  ok(`${name}: the in-game button also enters fullscreen`, await fsOn(p), JSON.stringify(await state(p)));
  await inFrameBtn(p); await sleep(1300);
  const w2 = await state(p);
  ok(`${name}: the in-game button also leaves it`, !w2.fs && !w2.css && matches(w2), JSON.stringify(w2));
}

try {
  { const p = await open("desktop", 1366, 800); await cycle("desktop", p, "api"); await p.setViewport({ width: 1920, height: 1080 }); await sleep(900); await scrollStage(p); const s = await state(p); ok(`desktop 1920x1080: windowed canvas is 16:9 (${s.iframe.join("x")})`, matches(s) && Math.abs(s.iframe[0] / s.iframe[1] - 16 / 9) < 0.03, JSON.stringify(s)); await p.close(); }
  { const p = await open("phone-portrait", 390, 844, { phone: true }); await cycle("phone-portrait", p, "api"); await p.close(); }
  { const p = await open("phone-landscape", 844, 390, { phone: true }); await cycle("phone-landscape", p, "api"); await p.close(); }
  { const p = await open("phone-portrait-noapi", 390, 844, { phone: true, api: false }); await cycle("phone-portrait-noapi", p, "css"); await p.close(); }
  { const p = await open("phone-landscape-noapi", 844, 390, { phone: true, api: false }); await cycle("phone-landscape-noapi", p, "css"); await p.close(); }
  ok("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) { fail++; process.exitCode = 1; console.log("FAIL exception", String(e).slice(0, 300)); }
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
