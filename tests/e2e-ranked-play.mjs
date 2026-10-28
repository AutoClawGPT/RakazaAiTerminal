// Items 2-6 e2e: a brand-new agent joins by key (auto-registered, lands on the game ready), presses the in-game PLAY button and AI PILOT,
// every run is registered with the server, ends after exactly 3 hits, and the score shows on the live board at once. No board/dev UI inside the game.
// Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/x node tests/e2e-ranked-play.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g3fix"; mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(16).slice(2, 8);
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
const handle = `rkplay${tag}`;
const reg = await (await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ name: `Ranked Play TEST ${tag}`, handle, bio: "automated demo agent (hidden afterwards)" }) })).json();
ok("register fresh agent", String(reg.key).startsWith("rk_"));
console.log("AGENT_ID", reg.agent?.id ?? reg.id ?? "?", "HANDLE", handle);
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function gf(p) { // the game frame can be re-created once the agent's saved progress is pulled: re-resolve until #play-button exists
  for (let i = 0; i < 80; i++) { try { const h = await p.$("iframe[data-testid=game-frame]"); const f = h && (await h.contentFrame()); if (f && (await f.$("#play-button"))) return f; } catch {} await sleep(750); }
  throw new Error("game frame not ready");
}
const lb = async () => (await (await fetch(BASE + "/api/public/games/ride-em/lb?range=24h", { cache: "no-store" })).json());
try {
  for (const [label, w, h] of [["desktop", 1280, 900], ["phone", 390, 800]].filter((x) => !process.env.ONLY || x[0] === process.env.ONLY)) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 });
    if (/localhost/.test(BASE)) await p.setExtraHTTPHeaders(ipH);
    const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector('[data-testid="pk-input"]', { timeout: 30000 });
    await p.type('[data-testid="pk-input"]', reg.key);
    await p.click('[data-testid="pk-go"]');
    await p.waitForFunction(() => location.pathname.startsWith("/games/ride-em"), { timeout: 40000, polling: 300 });
    ok(`${label}: join by key auto-registers and lands on the game`, true);
    await sleep(3500);
    const f = await gf(p);
    const ui = await f.evaluate(() => ({ txt: document.body.innerText, tabs: [...document.querySelectorAll("[data-tab]")].map((e) => e.dataset.tab) }));
    ok(`${label}: no BOARD tab inside the game`, !ui.tabs.includes("board") && !/\bBOARD\b/.test(ui.txt), ui.tabs.join(","));
    await f.evaluate(() => { const m = document.querySelector('[data-tab="settings"]'); m && m.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); m && m.click(); });
    await sleep(600);
    const st = await f.evaluate(() => document.body.innerText);
    ok(`${label}: no dev mode option in settings`, !/dev mode|dev panel|ENTER DEV/i.test(st) && /Settings/i.test(st));
    await p.screenshot({ path: `${SHOTS}/${label}-settings.png` });
    await f.evaluate(() => { const c = document.querySelector("#rmPanel .close, [data-close]"); c && c.click(); });
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
    let f2 = await gf(p);
    await sleep(2500);
    const before = (await lb()).top.filter((r) => r.handle === handle || r.name === handle).length;
    // 1) in-game PLAY button, no input: the character must die after exactly 3 hits
    await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" })); await sleep(500);
    await f2.click("#play-button");
    await f2.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
    const heartsSeen = []; let ranked = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const s = await f2.evaluate(() => { const g = window.__rz2.game; return { st: window.__rz2.state, lives: g ? g.lives : null, hits: g ? g.hits : null, agentRun: !!(g && g.agentRun) }; });
      if (s.agentRun) ranked = true;
      if (heartsSeen[heartsSeen.length - 1] !== s.lives && s.lives != null) heartsSeen.push(s.lives);
      if (s.st !== "play") break;
      await sleep(150);
    }
    ok(`${label}: in-game PLAY is a registered ranked run (agentRun on the run)`, heartsSeen.length > 0 && ranked);
    ok(`${label}: a no-input run goes 3 -> ... -> 0 and ends (lives seen: ${heartsSeen.join(">")})`, heartsSeen[0] === 3 && heartsSeen[heartsSeen.length - 1] === 0 && heartsSeen.length <= 4);
    await f2.waitForFunction(() => /posted|Rank|recorded|not recorded/i.test(document.getElementById("rz-rank")?.textContent || ""), { timeout: 30000, polling: 300 }).catch(() => {});
    const rk = await f2.evaluate(() => document.getElementById("rz-rank")?.textContent || "");
    ok(`${label}: game-over card says the score was posted (${rk})`, /posted|Rank #/.test(rk), rk);
    await sleep(1500);
    const after = await lb();
    const mine = after.top.filter((r) => r.handle === handle || r.name === handle || r.agent === handle);
    ok(`${label}: the run is on the live leaderboard right away`, mine.length > before, JSON.stringify(after.top.slice(0, 2)));
    // 2) AI PILOT button: also a registered ranked run (controller pilot); ended on purpose after a few seconds, the score is still posted
    await f2.click("#home-button"); await sleep(800);
        await f2.click("#ai-button");
    await f2.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
    await sleep(6000);
    const pil = await f2.evaluate(() => { const g = window.__rz2.game; return { agentRun: !!(g && g.agentRun), ctl: g && g.agentRun && g.agentRun.controller, st: window.__rz2.state }; });
    ok(`${label}: AI PILOT is a registered ranked run (pilot)`, pil.agentRun && pil.ctl === "pilot", JSON.stringify(pil));
    await f2.evaluate(() => window.RakazaGame.abort());
    await f2.waitForFunction(() => /posted|Rank #|not recorded/i.test(document.getElementById("rz-rank")?.textContent || ""), { timeout: 30000, polling: 300 }).catch(() => {});
    const rk2 = await f2.evaluate(() => document.getElementById("rz-rank")?.textContent || "");
    ok(`${label}: pilot run posted (${rk2})`, /posted|Rank #/.test(rk2));
    await sleep(1500);
    const after2 = (await lb()).top.filter((r) => r.handle === handle || r.name === handle);
    ok(`${label}: leaderboard has the agent after the pilot run (${after2.length} row)`, after2.length >= 1);
    const boardBelow = await p.evaluate(() => /Leaderboard|LIVE/i.test(document.body.innerText) && document.querySelector("[data-testid=game-board]") != null);
    ok(`${label}: live board is on the page below the game, not inside it`, boardBelow);
    await p.screenshot({ path: `${SHOTS}/${label}-after-play.png` });
    errs.length && console.log("pageerrors", errs.slice(0, 3));
    ok(`${label}: no page errors`, errs.length === 0);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
