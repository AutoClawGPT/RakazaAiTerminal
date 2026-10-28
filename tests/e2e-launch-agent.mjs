// A freshly registered normal agent opens Launch (sponsored 70/30) with its own session: no owner prompt, the flow runs on the same server pipeline.
// Usage: BASE=http://localhost:3200 SHOTS=/workspace/shots/g1b node tests/e2e-launch-agent.mjs
import { createRequire } from "node:module";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS ?? "/workspace/shots/g1b";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(16).slice(2, 8);
const ipH = { "x-forwarded-for": `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}` };
const reg = await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ipH }, body: JSON.stringify({ name: `Launch UI TEST ${tag}`, handle: `launch_ui_${tag}`, bio: "TEST agent for the Launch tab session test. Hidden after the test.", via: "skill" }) }).then((r) => r.json());
ok("register demo agent (no wallet)", String(reg.key).startsWith("rk_"), JSON.stringify(reg).slice(0, 100));
// signed out: /launch goes to sign in (owner gate stays for visitors)
const so = await fetch(BASE + "/launch", { redirect: "manual" });
ok("signed out /launch redirects to sign in", so.status === 307 && /\/login/.test(so.headers.get("location") || ""), String(so.status));
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
try {
  for (const [name, w, h, mobile] of [["desktop", 1280, 900, false], ["phone", 390, 844, true]]) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE + "/launch", { waitUntil: "networkidle2", timeout: 90000 });
    if (name === "desktop") {
      ok("desktop: signed-out /launch lands on sign in", /\/login/.test(p.url()));
      await p.goto(BASE + "/login?next=/launch", { waitUntil: "networkidle2", timeout: 90000 });
      await p.type("#lg-key", reg.key); await p.click('[data-testid="agent-login-go"]');
      await p.waitForFunction(() => location.pathname === "/launch", { timeout: 30000 }).catch(() => {});
      ok("desktop: after agent sign in you land on /launch", new URL(p.url()).pathname === "/launch", p.url());
    } else {
      await p.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 90000 });
      await p.type("#lg-key", reg.key); await p.click('[data-testid="agent-login-go"]');
      await p.waitForFunction(() => location.pathname.startsWith("/agents/me"), { timeout: 30000 });
      await p.goto(BASE + "/launch", { waitUntil: "networkidle2", timeout: 90000 });
    }
    await p.waitForSelector('[data-testid="agent-launch"]', { timeout: 30000 }).catch(() => {});
    await sleep(1200);
    const st = await p.evaluate(() => ({ url: location.pathname, owner: !!document.querySelector("#lg-pw, [data-testid=owner-signin]"), txt: document.body.innerText, flow: !!document.querySelector('[data-testid="agent-launch"]'), ca: !!document.querySelector("#al-ca"), wallet: !!document.querySelector("#al-wallet"), ident: document.querySelector('[data-testid="launch-identity"]')?.textContent || "", ov: document.documentElement.scrollWidth > innerWidth + 1 }));
    ok(`${name}: stays on /launch`, st.url === "/launch", st.url);
    ok(`${name}: no Owner sign in / Owner password box`, !st.owner && !/Owner password/i.test(st.txt));
    ok(`${name}: the sponsored 70/30 flow is shown`, st.flow && st.ca && /70%/.test(st.txt));
    ok(`${name}: your name is shown`, /Launch UI TEST/.test(st.ident), st.ident);
    ok(`${name}: no horizontal scroll`, !st.ov);
    await p.screenshot({ path: `${SHOTS}/launch-agent-${name}.png` });
    // run the first steps on the real server pipeline with the agent session
    const kp = (await import("node:crypto")).randomBytes(32);
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = BigInt("0x" + kp.toString("hex")), addr = ""; while (n > 0n) { addr = B58[Number(n % 58n)] + addr; n /= 58n; }
    await p.type("#al-ca", "3ATPh1qxdYXRVLcMd2eWmjESCLXJ7DvTqkqLjhPJfVNQ");
    await p.waitForSelector("#al-wallet", { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => document.querySelector("#al-wallet")?.scrollIntoView({ block: "center" }));
    await p.type("#al-wallet", addr.slice(0, 44)).catch(() => {});
    await sleep(600);
    const dis = await p.evaluate(() => document.querySelector('[data-testid="al-run"]')?.disabled);
    ok(`${name}: Run the agent is enabled with a CA and a fee wallet (no owner needed)`, dis === false, String(dis));
    if (dis === false) { await p.click('[data-testid="al-run"]'); await p.waitForFunction(() => /Working/.test(document.querySelector('[data-testid="al-run"]')?.textContent || "") === false || document.querySelector('[data-testid="al-err"]'), { timeout: 5000 }).catch(() => {}); await sleep(15000); }
    const after = await p.evaluate(() => ({ btn: document.querySelector('[data-testid="al-run"]')?.textContent || "", err: document.querySelector('[data-testid="al-err"]')?.textContent || "", steps: document.querySelector('[data-testid="al-steps"]')?.innerText || "" }));
    ok(`${name}: pipeline accepts the agent session (no owner/sign-in refusal)`, !/owner|Sign in with your agent key/i.test(after.err), after.err);
    console.log("   run button:", after.btn, "| steps:", after.steps.replace(/\n/g, " | ").slice(0, 200), "| err:", after.err.slice(0, 120));
    await p.screenshot({ path: `${SHOTS}/launch-agent-${name}-run.png` });
    if (name === "desktop") {
      // other owner gates with a normal session
      await p.goto(BASE + "/login?next=/dash", { waitUntil: "networkidle2", timeout: 60000 }); await sleep(800);
      const dd = await p.evaluate(() => ({ url: location.pathname + location.search, folded: !!document.querySelector('[data-testid="owner-signin-folded"]'), pwVisible: document.querySelector("[data-testid=owner-signin-folded]")?.open === true }));
      ok("owner page /dash with an agent session: owner box folded, not open", dd.folded && !dd.pwVisible, JSON.stringify(dd));
      await p.goto(BASE + "/studio", { waitUntil: "networkidle2", timeout: 60000 }); await sleep(800);
      const hint = await p.evaluate(() => document.querySelector('[data-testid="studio-owner-hint"]')?.textContent || "");
      ok("studio: a normal user is not asked for the Owner sign in", !/Owner only\. Sign in/i.test(hint) && /owner-only/i.test(hint), hint);
    }
    await p.close(); await ctx.close();
  }
  ok("no page errors", errs.length === 0, errs.join("|").slice(0, 200));
} finally { await b.close(); }
console.log(`${pass} passed, ${fail} failed`, `agent=launch_ui_${tag}`);
