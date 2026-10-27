// Step 1: the song's spectrum at 30 fps, read from a real AnalyserNode (same settings as src/lib/stage/song-player.ts:
// fftSize 2048, smoothing 0.3) inside an OfflineAudioContext, so the lip-sync sees what the live stage sees.
// usage: PUPPETEER_CORE=file:///.../puppeteer-core/lib/esm/puppeteer/puppeteer-core.js node spectra.mjs <song-file.mp3> <out.json>
import fs from "node:fs";
const puppeteer = (await import(process.env.PUPPETEER_CORE ?? "puppeteer-core")).default;
const BASE = process.env.BASE ?? "http://localhost:3200";
const [file, out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" });
const res = await p.evaluate(async (src) => {
  const SR = 48000;
  const arr = await (await fetch(src)).arrayBuffer();
  const probe = new OfflineAudioContext(2, 1, SR);
  const buf = await probe.decodeAudioData(arr);
  const ctx = new OfflineAudioContext(2, Math.ceil(buf.duration * SR), SR);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  an.smoothingTimeConstant = 0.3;
  s.connect(an).connect(ctx.destination);
  s.start(0);
  const frames = [];
  const step = 1 / 30;
  const n = Math.floor(buf.duration / step);
  for (let i = 1; i <= n; i++) {
    const t = Math.round((i * step) * SR / 128) * 128 / SR;
    ctx.suspend(t).then(() => {
      const fd = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(fd);
      let bin = "";
      for (let k = 0; k < fd.length; k++) bin += String.fromCharCode(fd[k]);
      frames.push({ t: i * step, fd: btoa(bin) });
      ctx.resume();
    });
  }
  await ctx.startRendering();
  return { sr: SR, fft: 2048, duration: buf.duration, frames };
}, `/songs/${file}`);
fs.writeFileSync(out, JSON.stringify(res));
console.log(file, "frames", res.frames.length, "dur", res.duration.toFixed(2));
await b.close();
