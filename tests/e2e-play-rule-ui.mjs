// Browser e2e of the PLAY RULE on the real game page (desktop + 390px phone, one fresh agent each). Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/x node tests/e2e-play-rule-ui.mjs
// 1) PLAY, pause > RESTART  => the first run is handed in with END: a VERIFIED run with its score (old build: the play was burnt, 0 runs).
// 2) the restarted run is abandoned by closing/reloading the page => the pagehide hand-in makes it a verified run too.
// 3) a third run played to its 3 hits is verified. 4) the 4th is refused with the reset time. After every step the progress panel / plays list / API must have moved.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/play-rule"; mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const hidden = [];
async function gf(p) { for (let i = 0; i < 80; i++) { try { const h = await p.$("iframe[data-testid=game-frame]"); const f = h && (await h.contentFrame()); if (f && (await f.$("#play-button"))) return f; } catch {} await sleep(750); } throw new Error("game frame not ready"); }
const me = async (key) => (await fetch(BASE + "/api/public/games/ride-em/me", { headers: { Authorization: `Bearer ${key}`, ...(/localhost/.test(BASE) ? ipH : {}) }, cache: "no-store" })).json();
async function until(fn, ms = 25000) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(500); } return v; }
try {
  for (const [label, w, h] of [["desktop", 1280, 900], ["phone", 390, 800]].filter((x) => !process.env.ONLY || x[0] === process.env.ONLY)) {
    const tag = Math.random().toString(16).slice(2, 8);
    const reg = await (await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ name: `Play Rule UI TEST ${tag}`, handle: `pruitest${tag}`, bio: "automated TEST agent (hidden afterwards)" }) })).json();
    ok(`${label}: register fresh agent`, String(reg.key).startsWith("rk_")); hidden.push(reg.id);
    const K = reg.key;
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 });
    if (/localhost/.test(BASE)) await p.setExtraHTTPHeaders(ipH);
    const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector('[data-testid="pk-input"]', { timeout: 30000 });
    await p.type('[data-testid="pk-input"]', K); await p.click('[data-testid="pk-go"]');
    await p.waitForFunction(() => location.pathname.startsWith("/games/ride-em"), { timeout: 40000, polling: 300 });
    await sleep(3500);
    let f = await gf(p);
    await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" })); await sleep(400);

    // 1) PLAY, then pause > RESTART
    await f.click("#play-button");
    await f.waitForFunction(() => window.__rz2 && window.__rz2.state === "play" && window.__rz2.game && window.__rz2.game.agentRun, { timeout: 20000, polling: 200 });
    const m0 = await me(K); ok(`${label}: the play is counted the moment the run starts (2 left, IN PROGRESS)`, m0.plays.left === 2 && m0.plays.runs[0]?.state === "in_progress", JSON.stringify(m0.plays.runs));
    await sleep(5000);
    await f.click("#pause-toggle"); await sleep(500);
    const pauseTxt = await f.evaluate(() => document.body.innerText);
    ok(`${label}: the pause menu says a ranked run ends and counts`, /ranked/i.test(pauseTxt), pauseTxt.slice(-200));
    await f.click("#pause-retry");
    const m1 = await until(async () => { const m = await me(K); return m.progress.runs >= 1 ? m : null; });
    ok(`${label}: RESTART handed the first run in: Verified runs 1, best score > 0, XP > 0, streak 1, ranked`, m1 && m1.progress.runs === 1 && m1.progress.best > 0 && m1.progress.xp > 0 && m1.progress.streak === 1 && m1.progress.rank.h24 >= 1, JSON.stringify(m1?.progress));
    const m1b = await until(async () => { const m = await me(K); return m.plays.left === 1 ? m : null; }, 15000);
    ok(`${label}: and the restart used the 2nd play (1 left)`, !!m1b, JSON.stringify((await me(K)).plays.left));
    await f.waitForFunction(() => window.__rz2.state === "play", { timeout: 15000, polling: 200 }).catch(() => {});
    await sleep(4000);

    // 2) close/reload the page in the middle of the 2nd run
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
    const m2 = await until(async () => { const m = await me(K); return m.progress.runs >= 2 ? m : null; }, 20000);
    ok(`${label}: reloading mid-run handed it in (pagehide): Verified runs 2, nothing left "in progress"`, m2 && m2.progress.runs === 2 && !m2.plays.inProgress, JSON.stringify(m2?.plays?.runs));
    await sleep(2500);
    f = await gf(p);
    const txt = await p.evaluate(() => document.body.innerText);
    ok(`${label}: the page lists today's plays as VERIFIED`, /VERIFIED/.test(txt), txt.slice(0, 200));
    await p.screenshot({ path: `${SHOTS}/${label}-after-2-runs.png` });

    // 3) the last play, played to its 3 hits with no input
    await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" })); await sleep(400);
    await f.click("#play-button");
    await f.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
    await f.waitForFunction(() => window.__rz2.state !== "play", { timeout: 120000, polling: 300 });
    const m3 = await until(async () => { const m = await me(K); return m.progress.runs >= 3 ? m : null; });
    ok(`${label}: 3rd run verified: Verified runs 3, 0 plays left`, m3 && m3.progress.runs === 3 && m3.plays.left === 0, JSON.stringify(m3?.progress));
    const board = await (await fetch(BASE + "/api/public/games/ride-em/leaderboard?range=24h&limit=100", { cache: "no-store" })).json();
    ok(`${label}: the live leaderboard has the agent`, board.top.some((x) => x.handle === `pruitest${tag}`));

    // 4) the 4th is refused with the reset time
    await sleep(1500);
    await f.click("#home-button").catch(() => {}); await sleep(700);
    await f.click("#play-button").catch(() => {}); await sleep(2500);
    const ranked4 = await f.evaluate(() => !!(window.__rz2.game && window.__rz2.game.agentRun));
    const msg = await p.evaluate(() => document.body.innerText);
    const m4 = await me(K);
    ok(`${label}: the 4th play is NOT ranked (free practice, never counted) and the server still shows 3 plays used, 3 verified runs`, !ranked4 && m4.plays.used === 3 && m4.plays.left === 0 && m4.progress.runs === 3, JSON.stringify(m4.plays.runs));
    ok(`${label}: the page says when plays reset`, /00:00 UTC/i.test(msg), msg.slice(0, 160));
    const refused = await (await fetch(BASE + "/api/public/games/ride-em/runs/start", { method: "POST", headers: { Authorization: `Bearer ${K}`, "content-type": "application/json", ...(/localhost/.test(BASE) ? ipH : {}) }, body: JSON.stringify({ mode: "classic" }) })).json();
    ok(`${label}: and the server refuses a 4th ranked start with the reset time`, refused.error === "no_plays_left" && /T00:00:00/.test(refused.resetsAt), JSON.stringify(refused).slice(0, 200));
    await p.screenshot({ path: `${SHOTS}/${label}-4th-refused.png`, fullPage: true });
    ok(`${label}: no page errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`\n${pass} passed, ${fail} failed. Test agents to hide: ${hidden.join(" ")}`);
