// Ride 'Em on phone (portrait + landscape, real touch events) and desktop (keyboard + mouse), embedded page and standalone.
import { createRequire } from "node:module";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.env.SHOTS ?? "/workspace/shots/g2";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m); } };
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function gameFrame(p) {
  await p.waitForSelector("iframe[data-testid=game-frame]", { timeout: 60000 });
  const h = await p.$("iframe[data-testid=game-frame]");
  const f = await h.contentFrame();
  await f.waitForSelector("#play-button", { timeout: 60000 });
  return f;
}
async function startRun(p, f, touch) {
  const r = await f.$("#play-button");
  const bb = await r.boundingBox();
  if (touch) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(2500);
}
async function probe(f) {
  return f.evaluate(() => {
    const u = document.getElementById("rakaza-input-ui");
    const rect = (t) => { const d = [...(u?.querySelectorAll("div") ?? [])].find((x) => x.textContent.trim() === t); if (!d) return null; const r = d.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, r: r.right, b: r.bottom }; };
    return { shown: !!u && u.style.display !== "none", jump: rect("Jump"), slide: rect("Slide"), iw: innerWidth, ih: innerHeight, fs: !!document.getElementById("rzFs"), over: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

for (const [name, w, h] of [["portrait", 390, 844], ["landscape", 844, 390]]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
  const f = await gameFrame(p);
  await sleep(1500);
  const fr = await p.evaluate(() => { const r = document.querySelector("iframe").getBoundingClientRect(); return { w: r.width, h: r.height }; });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!ov, `${name}: page has no horizontal overflow`);
  if (name === "portrait") ok(fr.h >= 480 && fr.w >= 340, `${name}: game fills the phone (${Math.round(fr.w)}x${Math.round(fr.h)})`);
  else ok(fr.h >= 260 && fr.w >= 700, `${name}: game fills the phone (${Math.round(fr.w)}x${Math.round(fr.h)})`);
  await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView({ behavior: "instant" }));
  await sleep(700);
  await p.screenshot({ path: `${OUT}/phone-${name}-embedded-menu.png` });
  await startRun(p, f, true);
  const pr = await probe(f);
  ok(pr.shown, `${name}: touch controls shown in a run`);
  ok(pr.jump && pr.jump.w >= 64 && pr.jump.h >= 64, `${name}: Jump button is big (${Math.round(pr.jump?.w)}px)`);
  ok(pr.slide && pr.slide.w >= 64, `${name}: Slide button is big (${Math.round(pr.slide?.w)}px)`);
  ok(pr.jump && pr.jump.r <= pr.iw && pr.jump.b <= pr.ih, `${name}: Jump inside the frame`);
  const vis = await p.evaluate(([y]) => { const r = document.querySelector("iframe").getBoundingClientRect(); return r.top + y; }, [pr.jump.y + pr.jump.h]);
  const navTop = name === "portrait" ? h - 72 : h;
  ok(vis <= navTop, `${name}: Jump button is above the site bottom bar (bottom at ${Math.round(vis)}, limit ${navTop})`);
  ok(pr.fs, `${name}: in-game fullscreen button present`);
  // real touch on the Jump button reaches the input kit
  await f.evaluate(() => { window.__seen = { a: 0, up: 0, down: 0 }; const o = window.RakazaInput.read.bind(window.RakazaInput); window.RakazaInput.read = () => { const r = o(); if (r.pressed.a) window.__seen.a++; if (r.move.y < -0.5) window.__seen.up++; if (r.move.y > 0.5) window.__seen.down++; return r; }; });
  const fb = await (await p.$("iframe[data-testid=game-frame]")).boundingBox();
  const jx = fb.x + pr.jump.x + pr.jump.w / 2, jy = fb.y + pr.jump.y + pr.jump.h / 2;
  await p.touchscreen.touchStart(jx, jy); await sleep(120);
  await sleep(150);
  await p.touchscreen.touchEnd(); await sleep(100);
  const held = await f.evaluate(() => window.__seen.a >= 1);
  ok(held === true, `${name}: touching Jump sets the jump input`);
  // tap the play field = jump
  const tx = fb.x + fb.width / 2, ty = fb.y + fb.height * 0.45;
  const hit = await f.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [fb.width / 2, fb.height * 0.45]);
  ok(hit === "world", `${name}: the play field (canvas) receives the tap (${hit})`);
  await p.touchscreen.tap(tx, ty); await sleep(200);
  await p.screenshot({ path: `${OUT}/phone-${name}-embedded-play.png` });
  // host page fullscreen button
  await p.evaluate(() => document.querySelector("[data-testid=game-toolbar]").scrollIntoView({ behavior: "instant", block: "center" })); await sleep(300);
  await p.click("[data-testid=game-fullscreen]"); await sleep(800);
  const fsOn = await p.evaluate(() => !!document.fullscreenElement || document.querySelector("[data-testid=game-stage]").dataset.full === "true");
  ok(fsOn, `${name}: FULLSCREEN button enters fullscreen`);
  await p.screenshot({ path: `${OUT}/phone-${name}-fullscreen.png` });
  await p.click("[data-testid=game-exit-fullscreen]").catch(() => {}); await sleep(600);
  const fsOff = await p.evaluate(() => !document.fullscreenElement && document.querySelector("[data-testid=game-stage]").dataset.full !== "true");
  ok(fsOff, `${name}: fullscreen exits`);
  ok(errs.length === 0, `${name}: no page errors ${errs.join("|")}`);
  await p.close();
}

// phone standalone landscape: tab bar is one row (does not eat the play field)
{
  const q = await b.newPage();
  await q.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await q.goto(BASE + "/games/ride-em/index.html", { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(1500);
  const hh = await q.evaluate(() => document.getElementById("rmTop").getBoundingClientRect().height);
  ok(hh < 60, `landscape standalone: top bar is one row (${Math.round(hh)}px)`);
  await q.close();
}

// desktop: keyboard + mouse
{
  const p = await b.newPage();
  await p.setViewport({ width: 1366, height: 800 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/games/ride-em", { waitUntil: "networkidle2", timeout: 90000 });
  const f = await gameFrame(p);
  await sleep(1200);
  const fr = await p.evaluate(() => { const r = document.querySelector("iframe").getBoundingClientRect(); return { w: r.width, h: r.height }; });
  ok(Math.abs(fr.w / fr.h - 16 / 9) < 0.06, `desktop: 16:9 stage (${Math.round(fr.w)}x${Math.round(fr.h)})`);
  await p.evaluate(() => document.querySelector("[data-testid=game-stage]").scrollIntoView());
  await startRun(p, f, false);
  ok(await f.evaluate(() => !!document.getElementById("rzFs")), "desktop: fullscreen button present");
  await f.evaluate(() => { window.__seen = { a: 0, up: 0, down: 0 }; const o = window.RakazaInput.read.bind(window.RakazaInput); window.RakazaInput.read = () => { const r = o(); if (r.pressed.a) window.__seen.a++; if (r.move.y < -0.5) window.__seen.up++; if (r.move.y > 0.5) window.__seen.down++; return r; }; });
  await p.keyboard.press("Space"); await sleep(250);
  await p.keyboard.down("KeyS"); await sleep(250); await p.keyboard.up("KeyS");
  await p.keyboard.down("KeyW"); await sleep(250); await p.keyboard.up("KeyW");
  const k = await f.evaluate(() => window.__seen);
  ok(k.a >= 1, "desktop: SPACE jumps");
  ok(k.down >= 1, "desktop: S slides");
  ok(k.up >= 1, "desktop: W jumps");
  await p.screenshot({ path: `${OUT}/desktop-embedded-play.png` });
  ok(errs.length === 0, `desktop: no page errors ${errs.join("|")}`);
  await p.close();
}
await b.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
