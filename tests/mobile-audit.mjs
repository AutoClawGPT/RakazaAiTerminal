// 390x844 mobile audit: screenshot every tab, detect horizontal overflow / offending elements, test the menu sheet open/close.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.env.OUT ?? "/workspace/shots/mobile";
fs.mkdirSync(OUT, { recursive: true });
const paths = ["/dash","/launch","/vanity","/keyvault","/pool","/splits","/shield","/lab","/kit","/dev","/vault","/fees","/trade","/rewards","/revenue","/history","/explore","/scanner","/dash/agents","/infra","/settings","/","/talk","/studio","/roadmap","/docs"];
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const res = [];
for (const path of paths) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
  const r = await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => ({ status: () => "ERR " + e.message }));
  await new Promise((r) => setTimeout(r, 800));
  const info = await p.evaluate(() => {
    const W = 390;
    const de = document.documentElement;
    const off = [];
    const scrollable = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && el.getBoundingClientRect().width === 0) continue;
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 || rc.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if ((rc.right > W + 1 || rc.left < -1) && !scrollable(el)) off.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : ""} [${Math.round(rc.left)},${Math.round(rc.right)}] ${(el.textContent || "").trim().slice(0, 30)}`);
    }
    // words that wrap mid-word (a single word whose range spans more than one line box)
    const broken = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) {
      const par = n.parentElement;
      if (!par || ["SCRIPT", "STYLE", "PRE", "CODE"].includes(par.tagName) || par.closest("pre,code,.rk-tape-track,[aria-hidden=true]")) continue;
      const t = n.textContent;
      for (const m of t.matchAll(/[A-Za-z]{6,}/g)) {
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        if ((m[0].match(/[a-z][A-Z]/g) || []).length >= 1 && /[A-Z]/.test(m[0].slice(1))) continue; // base58 addresses wrap on purpose
        const rects = [...r.getClientRects()].filter((x) => x.width > 0);
        const tops = new Set(rects.map((x) => Math.round(x.top / 4)));
        if (tops.size > 1) broken.push(`${par.tagName.toLowerCase()}: ${m[0]}`);
      }
    }
    return { broken: broken.slice(0, 8), sw: Math.max(de.scrollWidth, document.body.scrollWidth), W, off: off.slice(0, 6), nOff: off.length, h: de.scrollHeight };
  });
  const name = (path === "/" ? "home" : path.slice(1).replace(/\//g, "-"));
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: info.h < 6000 });
  res.push({ broken: info.broken, path, status: r.status?.(), overflow: info.sw > info.W, sw: info.sw, nOff: info.nOff, off: info.off, errs });
  await p.close();
}
// menu sheet open / close
const menu = {};
for (const path of ["/dash", "/", "/vanity"]) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.goto(BASE + path, { waitUntil: "networkidle2" });
  const trig = await p.$('button[aria-label^="Open"]');
  if (!trig) { menu[path] = "no trigger found"; await p.close(); continue; }
  const label = await trig.evaluate((e) => e.getAttribute("aria-label"));
  await trig.tap().catch(() => trig.click());
  await p.waitForSelector('[data-testid=menu-sheet]', { timeout: 5000 }).catch(() => {});
  const opened = !!(await p.$('[data-testid=menu-sheet]'));
  await new Promise((r) => setTimeout(r, 500));
  await p.screenshot({ path: `${OUT}/menu-open-${path === "/" ? "home" : path.slice(1)}.png` });
  const links = opened ? await p.$$eval('[data-testid=menu-sheet] a', (a) => a.length) : 0;
  await p.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 600));
  const closedEsc = !(await p.$('[data-testid=menu-sheet]'));
  // reopen and close with a link tap area / close button
  await (await p.$('button[aria-label^="Open"]')).click();
  await p.waitForSelector('[data-testid=menu-sheet]', { timeout: 5000 }).catch(() => {});
  const closeBtn = await p.$('[data-testid=menu-sheet] button[data-slot=sheet-close], [data-testid=menu-sheet] button:has(.sr-only)');
  if (closeBtn) await closeBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  const closedBtn = !(await p.$('[data-testid=menu-sheet]'));
  menu[path] = { label, opened, links, closedEsc, closedBtn: closeBtn ? closedBtn : "no close button" };
  await p.close();
}
await b.close();
console.log(JSON.stringify({ menu, res }, null, 1));
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ menu, res }, null, 1));
if (res.some((x) => x.overflow || x.broken.length || x.status !== 200)) process.exitCode = 1;
