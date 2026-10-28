// Group 3 UI e2e (desktop + phone): play-with-key, /agents/me game + brain setup, BYO Test pass/fail + curl, training prompt, chat, reminders, per-agent progress, board icons.
// Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/g3 node tests/e2e-agent-games-ui.mjs   (needs puppeteer-core from /workspace/shot-tool)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g3";
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const tag = Math.random().toString(16).slice(2, 8);
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
const reg = await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ name: `Games UI TEST ${tag}`, handle: `gamesui${tag}`, bio: "automated demo agent (hidden afterwards)" }) }).then((r) => r.json());
ok("register demo agent", String(reg.key).startsWith("rk_"), JSON.stringify(reg).slice(0, 120));
console.log("AGENT_ID", reg.agent?.id ?? reg.id ?? "?", "HANDLE", `gamesui${tag}`);
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
async function page(ctx, w, h) { const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 }); p.on("pageerror", (e) => errs.push(String(e))); if (/localhost/.test(BASE)) await p.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }); return p; }
const T = (id) => `[data-testid="${id}"]`;
const tap = async (p, sel) => { await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: "center", behavior: "instant" }), sel); await new Promise((r) => setTimeout(r, 400)); const hit = await p.evaluate((q) => { const e = document.querySelector(q); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, ok: !!t && e.contains(t), y: Math.round(r.y), h: Math.round(r.height), sy: Math.round(scrollY), vh: innerHeight, vv: Math.round(visualViewport?.offsetTop ?? 0), sc: visualViewport?.scale, iw: innerWidth, sw: document.documentElement.scrollWidth, wide: [...document.querySelectorAll('body *')].filter((x) => x.getBoundingClientRect().right > 392).slice(0, 6).map((x) => x.tagName + '.' + String(x.className).slice(0, 40) + '@' + Math.round(x.getBoundingClientRect().right)), top: t?.getAttribute?.("data-testid") ?? t?.tagName }; }, sel); if (!hit.ok) console.log("TAPMISS", sel, JSON.stringify(hit)); await p.mouse.click(hit.cx, hit.cy); };
const setVal = async (p, sel, v) => { await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: "center", behavior: "instant" }), sel); await p.focus(sel); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control"); await p.keyboard.press("Backspace"); if (v) await p.type(sel, v); };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
try {
  for (const [label, w, h] of [["desktop", 1280, 900], ["phone", 390, 800]].filter((x) => !process.env.ONLY || x[0] === process.env.ONLY)) {
    const ctx = await b.createBrowserContext();
    const p = await page(ctx, w, h); await p.bringToFront();
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector(T("games-signed-out"), { timeout: 20000 });
    ok(`${label}: signed out shows the play-with-key field`, !!(await p.$(T("pk-input"))));
    if (label === "desktop") {
      await p.type(T("pk-input"), "rk_wrongwrongwrongwrong"); await tap(p, T("pk-go"));
      await p.waitForSelector(T("pk-err"), { timeout: 20000 });
      ok(`${label}: a wrong key shows a clear error and stays here`, /\/agents\/me/.test(p.url()));
    }
    await p.screenshot({ path: `${SHOTS}/${label}-signed-out.png` });
    await setVal(p, T("pk-input"), reg.key); await tap(p, T("pk-go"));
    await p.waitForFunction(() => location.pathname.startsWith("/games/ride-em"), { timeout: 30000, polling: 300 });
    ok(`${label}: play-with-key signs in and lands on the game`, true);
    await p.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector(T("agent-games"), { timeout: 30000 });
    ok(`${label}: setup section visible, plays 3/3`, /3\/3/.test(await p.$eval(T("games-plays-left"), (e) => e.textContent)));
    ok(`${label}: avatar icon on the agent card`, await p.$eval(T("games-avatar"), (e) => e.getAttribute("src")?.length > 5));
    // brain: platform brain stays selectable
    await p.evaluate(() => document.querySelector('[data-testid="brain-panel"]').scrollIntoView()); await p.screenshot({ path: `${SHOTS}/${label}-brain-top.png` });
    await tap(p, T("brain-river")); await p.waitForSelector(T("brain-note"));
    const rn = await p.$eval(T("brain-note"), (e) => e.textContent); ok(`${label}: platform brain (River) can be selected`, /River/.test(rn), rn);
    // bring your own model: wrong endpoint -> FAIL with a curl
    await p.select(T("byo-preset"), "custom");
    await setVal(p, T("byo-base"), "https://nonexistent-host.invalid/v1");
    await p.type(T("byo-model"), "test-model"); await p.type(T("byo-key"), "sk-not-a-real-key-123456");
    await p.evaluate(() => { window.__clk = []; document.addEventListener("click", (e) => window.__clk.push(e.target?.closest?.("[data-testid]")?.getAttribute("data-testid") + "@" + Math.round(e.clientX) + "," + Math.round(e.clientY)), true); });
    await tap(p, T("byo-test"));
    try { await p.waitForSelector(T("byo-result"), { timeout: 30000, polling: 300 }); } catch (e) { console.log("DIAG", await p.evaluate(() => ({ clk: window.__clk, dis: document.querySelector('[data-testid="byo-test"]')?.disabled, txt: document.querySelector('[data-testid="byo-test"]')?.textContent, base: document.querySelector('[data-testid="byo-base"]')?.value, model: document.querySelector('[data-testid="byo-model"]')?.value }))); await p.screenshot({ path: `${SHOTS}/diag-${label}.png` }); throw e; }
    ok(`${label}: Test gives a clean FAIL for a bad endpoint`, (await p.$eval(T("byo-result"), (e) => e.getAttribute("data-pass"))) === "false" && /FAIL/.test(await p.$eval(T("byo-result"), (e) => e.textContent)));
    const curl = await p.$eval(T("byo-curl"), (e) => e.textContent);
    ok(`${label}: curl shown with placeholder, never the key`, /curl /.test(curl) && /\$API_KEY/.test(curl) && !/sk-not-a-real/.test(curl));
    ok(`${label}: copy curl button present`, !!(await p.$(T("byo-curl-copy"))));
    // http base is refused on save
    await setVal(p, T("byo-base"), "http://example.com/v1");
    await tap(p, T("byo-save")); await p.waitForSelector(T("brain-note"));
    await new Promise((r) => setTimeout(r, 800));
    ok(`${label}: http base URL refused with a message`, /https|http/i.test(await p.$eval(T("brain-note"), (e) => e.textContent)) && !/Saved/.test(await p.$eval(T("brain-note"), (e) => e.textContent)));
    // valid https config saves and persists by agent id
    await setVal(p, T("byo-base"), "https://api.example.com/v1");
    await tap(p, T("byo-save")); await new Promise((r) => setTimeout(r, 1500));
    ok(`${label}: valid https config saves`, /Saved/.test(await p.$eval(T("brain-note"), (e) => e.textContent)));
    // training prompt
    const prompt = await p.$eval(T("prompt-text"), (e) => e.textContent);
    ok(`${label}: training prompt has rules, scoring, API, MCP, reply format`, /RULES/i.test(prompt) && /SCORING/i.test(prompt) && /runs\/start/.test(prompt) && /MCP/.test(prompt) && /REPLY/i.test(prompt), prompt.slice(0, 80));
    ok(`${label}: prompt never contains a real key`, !prompt.includes(reg.key) && /\$RAKAZA_KEY/.test(prompt));
    // reminder
    // same agent is reused across desktop and phone passes: normalise to OFF first so the tap really turns it on
    if (await p.$eval(T("remind-on"), (e) => e.checked)) { await tap(p, T("remind-on")); await p.waitForFunction((s) => /Reminder off/.test(document.querySelector(s)?.textContent || ""), { polling: 300 }, T("remind-note")); }
    await tap(p, T("remind-on")); await p.waitForFunction((s) => /Reminder on/.test(document.querySelector(s)?.textContent || ""), { polling: 300 }, T("remind-note"));
    const mn = await p.$eval(T("remind-note"), (e) => e.textContent); ok(`${label}: reminder saves`, /Reminder on/.test(mn), mn);
    ok(`${label}: .ics link present`, (await p.$eval(T("remind-ics"), (e) => e.getAttribute("href"))).startsWith("data:text/calendar"));
    // chat
    await p.type(T("chat-input"), "Give me one tip"); await tap(p, T("chat-send"));
    await p.waitForFunction(() => document.querySelector('[data-testid="chat-msg-agent"]') || document.querySelector('[data-testid="chat-err"]'), { timeout: 60000, polling: 300 });
    ok(`${label}: chat shows my message and an answer or a clear error`, !!(await p.$(T("chat-msg-user"))) && !!(await p.$(`${T("chat-msg-agent")}, ${T("chat-err")}`)));
    ok(`${label}: no horizontal overflow`, (await overflow(p)) <= 1, String(await overflow(p)));
    await p.evaluate(() => document.querySelector('[data-testid="brain-panel"]').scrollIntoView());
    await p.screenshot({ path: `${SHOTS}/${label}-brain.png` });
    await p.evaluate(() => document.querySelector('[data-testid="agent-games"]').scrollIntoView());
    await p.screenshot({ path: `${SHOTS}/${label}-me.png` });
    // reload: config persisted by agent id (server), reminder still on
    await p.reload({ waitUntil: "networkidle2" }); await p.bringToFront(); await p.waitForSelector(T("agent-games"), { timeout: 30000 });
    ok(`${label}: setup persists after reload (reminder, BYO base)`, (await p.$eval(T("remind-on"), (e) => e.checked)) && (await p.$eval(T("byo-base"), (e) => e.value)) === "https://api.example.com/v1");
    // board icons on the game page
    await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
    await p.waitForSelector(T("game-board"), { timeout: 30000 }); await new Promise((r) => setTimeout(r, 1500));
    const rows = await p.$$eval(T("board-row"), (e) => e.length), icons = await p.$$eval(T("board-avatar"), (e) => e.length);
    ok(`${label}: every board row has a preview icon (${icons}/${rows})`, rows === icons);
    if (rows) { await p.evaluate(() => document.querySelector('[data-testid="game-board"]').scrollIntoView()); await p.screenshot({ path: `${SHOTS}/${label}-board.png` }); }
    await ctx.close();
  }
  // progress follows the agent id, not the key: server state written with the key shows up in a brand-new browser after a fresh play-with-key sign-in
  const wr = await fetch(BASE + "/api/public/games/ride-em/state", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${reg.key}`, ...ipH }, body: JSON.stringify({ state: { v: 1, ls: { rz_v2: { total: 777, best: 321 } } } }) });
  ok("state saved for the agent id via API", wr.ok, String(wr.status));
  const ctx2 = await b.createBrowserContext();
  const q = await page(ctx2, 1280, 900);
  await q.goto(BASE + "/agents/me", { waitUntil: "networkidle2", timeout: 90000 }); await q.waitForSelector(T("pk-input"));
  await q.type(T("pk-input"), reg.key); await q.click(T("pk-go"));
  await q.waitForFunction(() => location.pathname.startsWith("/games/ride-em"), { timeout: 30000 });
  await q.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("rz_v2") || "{}").total === 777; } catch { return false; } }, { timeout: 30000 }).catch(() => {});
  ok("new browser, same agent: saved game progress restored", await q.evaluate(() => { try { return JSON.parse(localStorage.getItem("rz_v2") || "{}").total === 777; } catch { return false; } }));
  await ctx2.close();
  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) { fail++; process.exitCode = 1; console.log("FAIL exception", String(e).slice(0, 400)); }
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
