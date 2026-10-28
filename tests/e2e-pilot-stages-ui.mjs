// AI pilot stages e2e (UI + real game): a brand-new agent joins by key (auto-registered, lands on the game ready), presses the in-game PLAY button and AI PILOT,
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
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector('[data-testid="pilot-stages"]', { timeout: 40000 });
    const card = await p.evaluate(() => { const g = (n) => document.querySelector(`[data-testid="pilot-stage-${n}"]`); return { n: [1,2,3,4,5,6].filter((n) => g(n)).length, cur: [1,2,3,4,5,6].filter((n) => g(n)?.getAttribute("aria-pressed") === "true"), dis6: !!g(6)?.disabled, locked6: /Locked/.test(g(6)?.innerText || ""), en5: g(5) && !g(5).disabled, txt: document.querySelector('[data-testid="pilot-stages"]').innerText }; });
    ok(`${label}: six stages shown, stage 1 current, stage 6 locked and disabled, 2-5 selectable`, card.n === 6 && card.cur.join() === "1" && card.dis6 && card.locked6 && card.en5, JSON.stringify(card));
    ok(`${label}: no payment / wallet wording in the stage card`, !/buy now|pay|wallet|connect/i.test(card.txt.replace(/Rakaza token later; nothing is bought today/i, "")), card.txt);
    await p.evaluate(() => document.querySelector('[data-testid="pilot-stages"]').scrollIntoView({ behavior: "instant" })); await sleep(300);
    await p.click('[data-testid="pilot-stage-3"]');
    await p.waitForFunction(() => document.querySelector('[data-testid="pilot-stage-3"]')?.getAttribute("aria-pressed") === "true", { timeout: 15000 });
    ok(`${label}: picking stage 3 saves it`, true);
    await p.screenshot({ path: `${SHOTS}/${label}-stages.png` });
    await p.click('[data-testid="pilot-stage-1"]');
    await p.waitForFunction(() => document.querySelector('[data-testid="pilot-stage-1"]')?.getAttribute("aria-pressed") === "true", { timeout: 15000 });
    // the beginner pilot in the real game: it loses (3 hits) and the score posts
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
    const f2 = await gf(p);
    await sleep(2500);
    const stg = await f2.evaluate(() => window.RakazaStages && { stage: window.RakazaStages.stage(), name: window.RakazaStages.name() });
    ok(`${label}: the game picked up stage 1 from the server (${JSON.stringify(stg)})`, stg && stg.stage === 1);
    await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" })); await sleep(400);
    await f2.click("#ai-button");
    await f2.waitForFunction(() => window.__rz2 && window.__rz2.state === "play", { timeout: 20000, polling: 200 });
    const lives = []; const t0 = Date.now(); let src = "";
    while (Date.now() - t0 < 100000) {
      const s = await f2.evaluate(() => { const g = window.__rz2.game; return { st: window.__rz2.state, lives: g ? g.lives : null, pi: typeof pilotInfo !== "undefined" ? 1 : 0 }; });
      if (s.lives != null && lives[lives.length - 1] !== s.lives) lives.push(s.lives);
      if (s.st !== "play") break;
      await sleep(150);
    }
    ok(`${label}: the beginner pilot loses all 3 lives (${lives.join(">")})`, lives[0] === 3 && lives[lives.length - 1] === 0);
    await f2.waitForFunction(() => /posted|Rank #|not recorded/i.test(document.getElementById("rz-rank")?.textContent || ""), { timeout: 30000, polling: 300 }).catch(() => {});
    const rk = await f2.evaluate(() => document.getElementById("rz-rank")?.textContent || "");
    ok(`${label}: the beginner run is posted by the server (${rk})`, /posted|Rank #/.test(rk));
    await sleep(1200);
    const mine = (await lb()).top.filter((r) => r.handle === handle || r.name === handle);
    ok(`${label}: the agent is on the live leaderboard`, mine.length >= 1);
    await p.screenshot({ path: `${SHOTS}/${label}-beginner-run.png` });
    // stage 5 via the page is picked up by the game too; stage 6 cannot be reached
    const set5 = await p.evaluate(async () => (await fetch("/api/public/games/ride-em/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pilotStage: 5 }) })).status);
    const set6 = await p.evaluate(async () => (await fetch("/api/public/games/ride-em/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pilotStage: 6 }) })).status);
    ok(`${label}: stage 5 saves (${set5}), stage 6 is refused as a normal user (${set6})`, set5 === 200 && set6 === 403);
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
    const f3 = await gf(p); await sleep(2500);
    const s5 = await f3.evaluate(() => window.RakazaStages.stage());
    ok(`${label}: the game now flies stage 5 (${s5}) and never 6`, s5 === 5);
    await p.evaluate(async () => (await fetch("/api/public/games/ride-em/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pilotStage: 1 }) })).status);
    ok(`${label}: no page errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
