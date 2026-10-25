// Headless browser check of /talk: VRM stage loads, a River reply is spoken via Deepgram Luna, and the Call button uses the same path.
// Uses a fake microphone. Real Deepgram + River calls, nothing is sent anywhere else.
import { createRequire } from "node:module";
const require = createRequire("/workspace/shot-tool/package.json");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE ?? "http://localhost:3200";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const log = { vrm: null, tts: [], chat: 0, token: null, ws: [], errs: [] };
p.on("pageerror", (e) => log.errs.push(String(e).slice(0, 200)));
p.on("response", async (r) => {
  const u = r.url();
  if (u.endsWith(".vrm")) log.vrm = r.status();
  if (u.includes("/api/voice/tts")) log.tts.push({ status: r.status(), type: r.headers()["content-type"], voice: r.headers()["x-rakaza-voice"] });
  if (u.includes("/api/chat")) log.chat++;
  if (u.includes("/api/voice/token")) log.token = r.status();
});
p.on("requestfailed", (r) => { if (r.url().includes("deepgram")) log.errs.push("deepgram req failed"); });
const cdp = await p.createCDPSession();
await cdp.send("Network.enable");
cdp.on("Network.webSocketCreated", (e) => log.ws.push(e.url.split("?")[0] + "?model=" + (/model=([^&]+)/.exec(e.url)?.[1] ?? "")));
cdp.on("Network.webSocketFrameReceived", (e) => { if (/"type":"Metadata"/.test(e.response.payloadData)) log.wsMeta = true; });
await p.evaluateOnNewDocument(() => {
  window.__played = 0;
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__played++; return orig.apply(this, arguments); };
});
await p.goto(`${BASE}/talk`, { waitUntil: "networkidle0", timeout: 60000 });
await p.waitForFunction(() => document.querySelector("[data-stage-state]")?.getAttribute("data-stage-state") !== "loading", { timeout: 60000 }).catch(() => log.errs.push("stage stuck loading"));
log.stage = await p.evaluate(() => document.querySelector("[data-stage-state]")?.getAttribute("data-stage-state"));
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /18\+ · start/.test(x.textContent))?.click());
await p.waitForSelector("#talk-input");
await p.type("#talk-input", "hi Rakaza, say hello in one short line");
await p.keyboard.press("Enter");
await p.waitForFunction(() => window.__played > 0, { timeout: 60000 }).catch(() => log.errs.push("no audio played after chat reply"));
log.playedAfterChat = await p.evaluate(() => window.__played);
log.lastReply = await p.evaluate(() => [...document.querySelectorAll("ol li p")].pop()?.textContent);
// live call path
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Call/.test(x.textContent))?.click());
await new Promise((r) => setTimeout(r, 5000));
log.callLabel = await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Hang up|Call/.test(x.textContent))?.textContent.trim());
log.callStatus = await p.evaluate(() => document.querySelector("[role=status]")?.textContent ?? null);
await p.screenshot({ path: process.env.SHOT ?? "/tmp/talk.png" });
await b.close();
console.log(JSON.stringify(log, null, 1));
const ok = log.vrm === 200 && log.stage === "ready" && log.tts.length && log.tts.every((t) => t.status === 200 && t.type === "audio/mpeg" && t.voice === "aura-2-luna-en") && log.playedAfterChat > 0 && log.token === 200 && log.ws.some((w) => w.includes("deepgram")) && log.callLabel === "Hang up";
console.log(ok ? "TALK E2E PASS" : "TALK E2E FAIL");
process.exit(ok ? 0 : 1);
