// Step 3: record the real 3D stage (same VRM, same rig-anim, same lighting as the site) frame by frame.
// The stage is driven one step per frame through the ?rkdebug capture hook in stage-canvas.tsx, so the result does
// not depend on how fast the machine renders. Every frame is a transparent PNG of the WebGL canvas.
// usage: node capture.mjs <feed.json> <startSec> <durSec> <outDir> [size=720] [scale=1.5]
import fs from "node:fs";
const puppeteer = (await import(process.env.PUPPETEER_CORE ?? "puppeteer-core")).default;
const BASE = process.env.BASE ?? "http://localhost:3200";
const [feedPath, startS, durS, outDir, sizeS = "720", scaleS = "1.5"] = process.argv.slice(2);
const feed = JSON.parse(fs.readFileSync(feedPath, "utf8"));
const FPS = 30, WARM = +(process.env.WARM ?? 60);
const start = +startS, dur = +durS, SIZE = +sizeS;
fs.mkdirSync(outDir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const p = await b.newPage();
await p.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: +scaleS });
p.on("pageerror", (e) => console.log("PAGEERR", e.message.slice(0, 200)));
await p.goto(`${BASE}/talk?rkdebug=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
for (let k = 0; k < 360; k++) { const st = await p.evaluate(() => ({ v: !!window.__rkVrm, c: !!window.__rkCap, k: !!(window.__rkCap && window.__rkCap.controls), u: location.href, cv: !!document.querySelector('canvas') })); if (k % 20 === 0) console.log('wait', JSON.stringify(st)); if (st.v && st.c && st.k) break; await new Promise((r) => setTimeout(r, 250)); }
// the canvas fills the whole viewport (the page chrome around it is irrelevant, only the canvas pixels are read)
await p.addStyleTag({ content: ".rk-stage{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:99999!important;max-width:none!important;max-height:none!important;border-radius:0!important}" });
await new Promise((r) => setTimeout(r, 1200));
await p.evaluate(() => {
  const c = window.__rkCap;
  c.feed = { pending: false, dt: 1 / 30, beat: 0, bpm: 120, energy: 0.6, level: 0, low: 0, mid: 0, high: 0 };
  // extra colour lights for the stage show (the site's own lights stay as they are)
  let key = null;
  c.scene.traverse((o) => { if (o.isDirectionalLight && !key) key = o; });
  const mk = (x, y, z) => { const l = key.clone(); l.position.set(x, y, z); l.intensity = 0; c.scene.add(l); return l; };
  window.__show = { L: mk(-2.2, 1.4, -1.2), R: mk(2.2, 1.0, -1.4), F: mk(0.2, 0.4, 3), base: c.camera.position.length() };
});
const info = await p.evaluate(() => ({ cam: window.__rkCap.camera.position.toArray(), tgt: window.__rkCap.controls.target.toArray(), canvas: [document.querySelector("canvas").width, document.querySelector("canvas").height] }));
console.log("start", JSON.stringify(info));
const SHOTS = JSON.parse(process.env.SHOTS ?? "null") ?? [
  // [target y, distance x fit, azimuth deg, camera height offset]
  { ty: 1.12, m: 2.6, az: 0, dy: 0.15 }, // wide: head to the knees, room above the caption band
  { ty: 1.12, m: 1.4, az: -14, dy: 0.08 }, // medium
  { ty: 1.42, m: 0.62, az: 9, dy: 0.0 }, // close up on the face (lip-sync)
  { ty: 1.1, m: 2.5, az: 20, dy: -0.2 }, // wide low angle from the side
  { ty: 1.12, m: 1.55, az: 17, dy: 0.1 }, // medium from the other side
];
const PAL = ["#9d7bff", "#ff6fb5", "#4de1ff", "#ffcf5a"];
const idx0 = Math.round(start * FPS);
const GIDX0 = Math.round(+(process.env.VSTART ?? start) * FPS); // first frame of the whole video (chunks are numbered from it)
const total = Math.round(dur * FPS);
const t0 = Date.now();
for (let i = -WARM; i < total; i++) {
  const fi = Math.min(feed.frames.length - 1, Math.max(0, idx0 + i));
  const f = feed.frames[fi];
  const vt = (idx0 + i) / FPS; // song time (continuous across chunks)
  const data = await p.evaluate(async (f, vt, i, SHOTS, PAL) => {
    const c = window.__rkCap, S = window.__show;
    // shot changes every 8 beats, on the beat
    const shotLen = 8;
    const bi = Math.floor(f.beat / shotLen);
    const sh = SHOTS[((bi % SHOTS.length) + SHOTS.length) % SHOTS.length];
    const within = (f.beat - bi * shotLen) / shotLen; // 0..1 inside the shot (slow push in)
    const D = S.base0 ?? (S.base0 = S.base);
    const dist = D * sh.m * (1 - 0.06 * within) * (1 - 0.018 * Math.max(0, Math.cos(Math.PI * 2 * f.beat)) * f.energy);
    const az = (sh.az + 3 * Math.sin(vt * 0.9)) * Math.PI / 180;
    c.controls.target.set(0, sh.ty, 0);
    c.camera.position.set(Math.sin(az) * dist, sh.ty + sh.dy + 0.04, Math.cos(az) * dist);
    c.camera.lookAt(0, sh.ty, 0);
    // coloured rim lights follow the music: a new colour every 4 beats, flashing on the beat
    const k = Math.floor(f.beat / 4);
    const pulse = 0.55 + 0.45 * Math.max(0, Math.cos(Math.PI * 2 * f.beat));
    S.L.color.set(PAL[k % 4]); S.L.intensity = 1.5 * pulse + 0.6 * f.bass;
    S.R.color.set(PAL[(k + 2) % 4]); S.R.intensity = 1.5 * (1.15 - pulse * 0.5) + 0.6 * f.bass;
    S.F.color.set(PAL[(k + 1) % 4]); S.F.intensity = 0.25 + 0.25 * f.bass;
    const s = c.seq;
    Object.assign(c.feed, { dt: 1 / 30, beat: f.beat, bpm: f.bpm, energy: f.energy, level: f.level, low: f.low, mid: f.mid, high: f.high, pending: true });
    while (c.seq === s) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    if (i < 0) return null;
    return document.querySelector("canvas").toDataURL("image/png").slice(22);
  }, f, vt, i, SHOTS, PAL);
  if (data) fs.writeFileSync(`${outDir}/${String(idx0 + i + 1 - GIDX0).padStart(5, "0")}.png`, Buffer.from(data, "base64"));
  if (i % 60 === 0) console.log("frame", i, "of", total, ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
console.log("done", total, "frames");
await b.close();
