// Real bring-your-own-model flow in a real browser: fresh agent -> /agents/me -> add endpoint -> model list -> Test -> chat -> use for game -> AI PILOT really uses it -> score on the board.
// The provider key is read at run time from the file named by BYO_KEY_FILE and typed into the page; it is never printed, logged or screenshotted (the field is masked).
// Usage: BASE=https://rakaza-ai-terminal.vercel.app BYO_KEY_FILE=/home/box/.private-byo/user-api-key BYO_BASE=https://tokenplus.net BYO_MODEL=deepseek-v4-flash [PROTO=anthropic] [ONLY=desktop|phone] node tests/e2e-byo-live.mjs
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g3fix-live"; mkdirSync(SHOTS, { recursive: true });
const KEY = readFileSync(process.env.BYO_KEY_FILE ?? "/home/box/.private-byo/user-api-key", "utf8").trim();
const BYO_BASE = process.env.BYO_BASE ?? "https://tokenplus.net", WANT = process.env.BYO_MODEL ?? "deepseek-v4-flash", PROTO = process.env.PROTO ?? "";
const scrub = (s) => String(s).split(KEY).join("[key]");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, scrub(x)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
const tag = Math.random().toString(16).slice(2, 8), handle = `rkbyo${tag}`;
const reg = await (await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `BYO Flow TEST ${tag}`, handle, bio: "automated demo agent, hidden afterwards" }) })).json();
ok("register fresh agent", String(reg.key).startsWith("rk_")); console.log("AGENT", reg.agent?.id ?? "?", handle);
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function gf(p) { for (let i = 0; i < 80; i++) { try { const h = await p.$("iframe[data-testid=game-frame]"); const f = h && (await h.contentFrame()); if (f && (await f.$("#play-button"))) return f; } catch {} await sleep(750); } throw new Error("game frame not ready"); }
const lb = async () => (await (await fetch(BASE + "/api/public/games/ride-em/lb?range=24h", { cache: "no-store" })).json());
try {
  for (const [label, w, h] of [["desktop", 1280, 900], ["phone", 390, 800]].filter((x) => !process.env.ONLY || x[0] === process.env.ONLY)) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 });
    const errs = []; p.on("pageerror", (e) => errs.push(scrub(e)));
    const tap = async (sel) => { await p.waitForSelector(sel, { timeout: 30000 }); await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center", behavior: "instant" }), sel); await sleep(300); await p.click(sel); };
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector(T("pk-input"), { timeout: 30000 }); await p.type(T("pk-input"), reg.key); await p.click(T("pk-go"));
    await p.waitForFunction(() => location.pathname.startsWith("/games/ride-em"), { timeout: 40000, polling: 300 });
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 }); await p.waitForSelector(T("byo-panel"), { timeout: 30000 });
    ok(`${label}: no platform chat window, chat locked before a Test`, !(await p.evaluate(() => /uses your selected brain/i.test(document.body.innerText))) && !!(await p.$(T("chat-locked"))));
    await tap(T("brain-byo")); await sleep(500);
    await p.select(T("byo-preset"), "custom").catch(() => {});
    await p.evaluate((s) => { const e = document.querySelector(s); e.value = ""; }, T("byo-base"));
    await p.type(T("byo-base"), BYO_BASE); await p.type(T("byo-key"), KEY);
    if (PROTO) await p.select(T("byo-proto"), PROTO);
    await tap(T("byo-detect"));
    await p.waitForFunction((s) => document.querySelector(s)?.options.length > 3, { timeout: 60000, polling: 300 }, T("byo-model-select"));
    const opts = await p.$$eval(`${T("byo-model-select")} option`, (o) => o.map((x) => x.value).filter(Boolean));
    console.log("MODEL_LIST", opts.length, opts.slice(0, 8).join(", "));
    ok(`${label}: model list pulled from GET {base}/v1/models into a dropdown (${opts.length} models)`, opts.length > 3 && opts.includes(WANT), String(opts.length));
    await p.select(T("byo-model-select"), WANT);
    await p.screenshot({ path: `${SHOTS}/${label}-byo-models.png` });
    await tap(T("byo-test"));
    await p.waitForSelector(T("byo-result"), { timeout: 60000, polling: 300 });
    const res = scrub(await p.$eval(T("byo-result"), (e) => e.textContent)); console.log("TEST_RESULT", res.slice(0, 260));
    ok(`${label}: Test PASS from our server (${res.slice(0, 90)})`, (await p.$eval(T("byo-result"), (e) => e.getAttribute("data-pass"))) === "true" && /PASS/.test(res));
    const curl = await p.$eval(T("byo-curl"), (e) => e.textContent); ok(`${label}: curl shown, never the key`, /curl /.test(curl) && !curl.includes(KEY));
    await p.screenshot({ path: `${SHOTS}/${label}-byo-test.png` });
    await p.waitForSelector(T("chat-input"), { timeout: 10000 });
    await p.type(T("chat-input"), "Say hello in five words."); await tap(T("chat-send"));
    await p.waitForFunction(() => document.querySelector('[data-testid="chat-msg-agent"]') || document.querySelector('[data-testid="chat-err"]'), { timeout: 60000, polling: 300 });
    const ans = scrub(await p.$eval(`${T("chat-msg-agent")}, ${T("chat-err")}`, (e) => e.textContent)); console.log("CHAT_REPLY", ans.slice(0, 160));
    ok(`${label}: small chat answered by the tested model`, !!(await p.$(T("chat-msg-agent"))) && !(await p.$(T("chat-err"))), ans);
    ok(`${label}: chat says which model answered`, /answered by/.test(scrub(await p.$eval(T("chat-via"), (e) => e.textContent).catch(() => ""))));
    await p.screenshot({ path: `${SHOTS}/${label}-byo-chat.png` });
    if (!(await p.$eval(T("byo-keep"), (e) => e.checked))) await tap(T("byo-keep"));
    await tap(T("byo-save")); await p.waitForFunction((s) => /now the game brain/i.test(document.querySelector(s)?.textContent || ""), { timeout: 30000, polling: 300 }, T("brain-note"));
    ok(`${label}: "Use for the game" sets it as the game brain`, true);
    await p.screenshot({ path: `${SHOTS}/${label}-byo-saved.png` });
    // same tab -> the game: AI PILOT must really be driven by the model
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 }); await sleep(3500);
    const f = await gf(p); await sleep(1500);
    const before = (await lb()).top.filter((r) => r.handle === handle || r.name === handle).length;
    await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" })); await sleep(500);
    await f.click("#ai-button");
    await f.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
    let st = null; const t0 = Date.now();
    while (Date.now() - t0 < 60000) { st = await f.evaluate(() => { const B = window.RakazaBrain; return B ? B.status() : null; }); if (st && st.stats && st.stats.live >= 2) break; await sleep(1000); }
    console.log("BRAIN_STATUS", scrub(JSON.stringify({ mode: st?.mode, label: st?.label, calls: st?.stats?.calls, live: st?.stats?.live, fellBack: st?.stats?.fellBack, avgMs: st?.stats?.avgMs, model: st?.stats?.lastModel, reason: st?.stats?.lastReason })));
    ok(`${label}: game brain mode is "byo" with real live decisions from ${WANT}`, st && st.mode === "byo" && st.stats && st.stats.live >= 1 && st.stats.lastModel === WANT, JSON.stringify(st && { mode: st.mode, s: st.stats }));
    await p.screenshot({ path: `${SHOTS}/${label}-byo-game.png` });
    await f.evaluate(() => window.RakazaGame.abort());
    await f.waitForFunction(() => /posted|Rank #|not recorded/i.test(document.getElementById("rz-rank")?.textContent || ""), { timeout: 30000, polling: 300 }).catch(() => {});
    const rk = await f.evaluate(() => document.getElementById("rz-rank")?.textContent || ""); await sleep(1500);
    ok(`${label}: score posted (${rk})`, /posted|Rank #/.test(rk));
    const mine = (await lb()).top.filter((r) => r.handle === handle || r.name === handle);
    ok(`${label}: agent is on the live leaderboard`, mine.length >= 1 && mine.length >= before);
    ok(`${label}: no page errors`, errs.length === 0, errs.join("|"));
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
