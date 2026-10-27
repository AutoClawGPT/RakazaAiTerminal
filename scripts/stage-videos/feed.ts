// Step 2: per-frame stage inputs for one song, computed with the SAME modules the live stage uses
// (beat grid from beat-detect.ts, mouth from lipsync.ts over the real analyser spectrum from spectra.mjs).
// usage: tsx feed.ts <song-file.mp3> <spectra.json> <out.json>
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { analyzeBeats, beatPosition, energyAt } from "../../src/lib/stage/beat-detect";
import { newLipState, songLipFrame } from "../../src/lib/stage/lipsync";

const [file, specPath, out] = process.argv.slice(2);
const SR = 44100;
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", `public/songs/${file}`, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const mono = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const a = analyzeBeats(mono, SR);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as { sr: number; fft: number; frames: { t: number; fd: string }[] };
const lip = newLipState();
const half = a.bpm > 150 ? 0.5 : 1;
const hz = spec.sr / spec.fft;
const BARS = 16;
const frames = spec.frames.map((f) => {
  const fd = Uint8Array.from(Buffer.from(f.fd, "base64"));
  const l = songLipFrame(fd, hz, lip, 1 / 30);
  const bars: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const lo = Math.max(1, Math.floor((60 * Math.pow(9000 / 60, i / BARS)) / hz));
    const hi = Math.max(lo + 1, Math.floor((60 * Math.pow(9000 / 60, (i + 1) / BARS)) / hz));
    let m = 0;
    for (let k = lo; k < hi && k < fd.length; k++) m = Math.max(m, fd[k]);
    bars.push(+Math.min(1, Math.pow(m / 255, 1.4) * (0.85 + (i / BARS) * 0.5)).toFixed(3));
  }
  let bass = 0;
  for (let k = 1; k < 6; k++) bass = Math.max(bass, fd[k]);
  return { t: +f.t.toFixed(4), beat: Math.max(0, beatPosition(a, f.t)) * half, bpm: a.bpm * half, energy: energyAt(a, f.t), level: l.level, low: l.low, mid: l.mid, high: l.high, bass: +(bass / 255).toFixed(3), bars };
});
fs.writeFileSync(out, JSON.stringify({ bpm: a.bpm, offset: a.offset, conf: a.confidence, beats: a.grid, duration: a.duration, frames }));
console.log(file, "bpm", a.bpm.toFixed(1), "frames", frames.length, "level max", Math.max(...frames.map((f) => f.level)).toFixed(2));
