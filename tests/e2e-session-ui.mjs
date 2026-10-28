// Real login flow in headless Chrome: agent key -> no "Sign in" anywhere in menu/footer/header, name shown, Sign out works, server progress stays.
// Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/g1 node tests/e2e-session-ui.mjs   (needs puppeteer-core from /workspace/shot-tool)
import { createRequire } from "node:module";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g1";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const tag = Math.random().toString(16).slice(2, 8);
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}` };
const reg = await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ name: `Session UI TEST ${tag}`, handle: `session_ui_${tag}`, bio: "TEST agent for the sign-in state test. Hidden after the test.", via: "skill" }) }).then((r) => r.json());
ok("register demo agent", String(reg.key).startsWith("rk_"), JSON.stringify(reg).slice(0, 120));
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
async function page(w, h) { const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 }); p.on("pageerror", (e) => errs.push(String(e))); return p; }
const bodyHasSignIn = (p) => p.evaluate(() => [...document.querySelectorAll("a,button")].some((e) => /^\s*sign in\s*$/i.test(e.textContent || "") && e.getBoundingClientRect().width > 0 || /^\s*sign in\s*$/i.test(e.textContent || "")));
const accState = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid="account-state"]')].map((e) => e.getAttribute("data-state")));
const settle = (p) => p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="account-state"]')].some((e) => e.getAttribute("data-state") === "loading"), { timeout: 20000 }).catch(() => {});
try {
  const d = await page(1280, 900);
  // signed out: Sign in visible in menu/footer
  await d.goto(BASE + "/explore", { waitUntil: "networkidle2", timeout: 90000 }); await settle(d);
  ok("signed out: footer shows Sign in", (await accState(d)).includes("out"));
  await d.screenshot({ path: `${SHOTS}/desktop-signed-out.png` });
  // real login through the form
  await d.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 90000 });
  await d.type("#lg-key", reg.key); await d.click('[data-testid="agent-login-go"]');
  await d.waitForFunction(() => location.pathname.startsWith("/agents/me"), { timeout: 30000 });
  ok("login lands on dashboard", true);
  for (const path of ["/", "/games", "/explore", "/leaderboard", "/roadmap"]) {
    await d.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90000 }); await settle(d);
    const st = await accState(d);
    ok(`${path}: footer state is signed in`, st.length > 0 && st.every((s) => s === "in"), JSON.stringify(st));
    const txt = await d.evaluate(() => document.querySelector('footer [data-testid="account-name"]')?.textContent);
    ok(`${path}: footer shows agent name`, /Session UI TEST/.test(txt || ""), String(txt));
  }
  // open the menu sheet
  await d.goto(BASE + "/games", { waitUntil: "networkidle2", timeout: 90000 }); await settle(d);
  await d.click('button[aria-label="Open menu"]'); await d.waitForSelector('[data-testid="menu-sheet"] [data-testid="account-state"]'); await new Promise((r) => setTimeout(r, 600));
  const menuTxt = await d.evaluate(() => document.querySelector('[data-testid="menu-sheet"]').innerText);
  ok("menu: no Sign in entry", !/\bSign in\b/.test(menuTxt), menuTxt.slice(0, 300));
  ok("menu: Sign out present", /Sign out/.test(menuTxt));
  ok("menu: Launch + Self launch present", /Launch/.test(menuTxt) && /Self launch/.test(menuTxt));
  ok("menu: Integrations not in main menu", !/Integrations/.test(menuTxt));
  await d.screenshot({ path: `${SHOTS}/desktop-menu-signed-in.png` });
  await d.keyboard.press("Escape");
  // sign out from the footer
  const keepBefore = await fetch(BASE + "/api/public/games/leaderboard?game=ride-em", { headers: ipH }).then((r) => r.status);
  await d.evaluate(() => document.querySelector('footer [data-testid="account-signout"]').click());
  await d.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
  await d.goto(BASE + "/explore", { waitUntil: "networkidle2", timeout: 90000 }); await settle(d);
  ok("after sign out: state is out", (await accState(d)).every((s) => s === "out"));
  const me = await d.evaluate(() => fetch("/api/public/me/get_me").then((r) => r.json()));
  ok("after sign out: session cookie cleared (get_me null)", me === null, JSON.stringify(me));
  // agent still exists server side: key still logs in
  const again = await fetch(BASE + "/api/public/agents/login", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ key: reg.key }) });
  ok("server-side agent kept after sign out (key still valid)", again.status === 200);
  // phone
  const m = await page(390, 844);
  await m.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 90000 });
  await m.type("#lg-key", reg.key); await m.click('[data-testid="agent-login-go"]');
  await m.waitForFunction(() => location.pathname.startsWith("/agents/me"), { timeout: 30000 });
  await m.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 90000 }); await settle(m);
  await m.click('button[aria-label="Open menu"]'); await m.waitForSelector('[data-testid="menu-sheet"] [data-testid="account-state"][data-state="in"]', { timeout: 20000 }); await new Promise((r) => setTimeout(r, 600));
  const mt = await m.evaluate(() => document.querySelector('[data-testid="menu-sheet"]').innerText);
  ok("phone menu: signed in, no Sign in", /Session UI TEST/.test(mt) && !/\bSign in\b/.test(mt));
  await m.screenshot({ path: `${SHOTS}/phone-menu-signed-in.png` });
  await m.evaluate(() => document.querySelector('[data-testid="menu-sheet"] [data-testid="account-signout"]').click());
  await m.waitForFunction(() => location.pathname === "/", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  await m.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 90000 }); await settle(m);
  await m.click('button[aria-label="Open menu"]'); await m.waitForSelector('[data-testid="menu-sheet"] [data-testid="account-state"][data-state="out"]', { timeout: 20000 });
  ok("phone menu after sign out: Sign in is back", true);
  await m.screenshot({ path: `${SHOTS}/phone-menu-signed-out.png` });
  // talk links
  await m.goto(BASE + "/talk", { waitUntil: "networkidle2", timeout: 90000 });
  const adult = await m.$("input[type=checkbox]"); if (adult) { await adult.click(); const btn = await m.$("button.rk-btn"); if (btn) await btn.click().catch(() => {}); }
  await new Promise((r) => setTimeout(r, 1500));
  const links = await m.evaluate(() => [...document.querySelectorAll('[data-testid="talk-links"] a')].map((a) => a.textContent));
  ok("talk: Launch and Self launch links", links.includes("Launch") && links.includes("Self launch"), JSON.stringify(links));
  await m.screenshot({ path: `${SHOTS}/phone-talk.png` });
  // roadmap integrations section + route alive
  const r2 = await fetch(BASE + "/roadmap", { headers: ipH }).then((r) => r.text());
  ok("roadmap has Integrations section", r2.includes("roadmap-integrations"));
  const ri = await fetch(BASE + "/settings/integrations", { redirect: "manual" });
  ok("/settings/integrations route still answers", [200, 307, 308].includes(ri.status), String(ri.status));
  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} finally {
  await b.close();
  if (reg.agentId || reg.id) console.log("agent id", reg.agentId ?? reg.id);
  console.log(`${pass} passed, ${fail} failed`);
}
