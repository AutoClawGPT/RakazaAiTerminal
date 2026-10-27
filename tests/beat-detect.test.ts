import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBeats, beatPosition, energyAt } from "../src/lib/stage/beat-detect";

const SR = 22050;
function track(bpm: number, offset: number, secs: number, opts: { noise?: number; hats?: boolean; swing?: boolean } = {}) {
  const x = new Float32Array(SR * secs);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const spb = 60 / bpm;
  for (let b = 0; offset + b * spb < secs - 0.3; b++) {
    const s = Math.floor((offset + b * spb) * SR);
    const loud = b % 4 === 0 ? 1 : 0.8;
    for (let i = 0; i < SR * 0.18; i++) {
      const t = i / SR;
      x[s + i] += loud * 0.8 * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 28)) * t) * Math.exp(-t * 22);
    }
    if (opts.hats) {
      const h = s + Math.floor((spb / 2) * SR);
      for (let i = 0; i < SR * 0.04; i++) if (h + i < x.length) x[h + i] += 0.25 * rnd() * Math.exp(-(i / SR) * 90);
    }
  }
  // a steady "pad" so it is not just clicks
  for (let i = 0; i < x.length; i++) x[i] += 0.08 * Math.sin((2 * Math.PI * 220 * i) / SR) + (opts.noise ?? 0) * rnd();
  return x;
}
const phaseErr = (off: number, truth: number, bpm: number) => {
  const p = 60 / bpm;
  const d = (((off - truth) % p) + p) % p;
  return Math.min(d, p - d);
};

test("beat detect: finds tempo and phase of clean four-on-the-floor tracks", () => {
  for (const [bpm, off] of [[96, 0.2], [112, 0.35], [120, 0.1], [128, 0.4], [140, 0.05]] as const) {
    const a = analyzeBeats(track(bpm, off, 24), SR);
    assert.ok(Math.abs(a.bpm - bpm) < 1.0, `bpm ${bpm}: got ${a.bpm}`);
    assert.ok(phaseErr(a.offset, off, bpm) < 0.045, `offset ${bpm}: got ${a.offset} want ${off}`);
    assert.ok(a.confidence > 1.1, `confidence ${a.confidence}`);
  }
});

test("beat detect: survives noise and off-beat hats", () => {
  const a = analyzeBeats(track(108, 0.25, 30, { noise: 0.15, hats: true }), SR);
  assert.ok(Math.abs(a.bpm - 108) < 1.5, `bpm got ${a.bpm}`);
  assert.ok(phaseErr(a.offset, 0.25, 108) < 0.06, `offset got ${a.offset}`);
});

test("beat grid: position advances one per beat and stays locked over a minute", () => {
  const a = analyzeBeats(track(124, 0.3, 60), SR);
  const spb = 60 / 124;
  let prev = -1;
  for (let t = 1; t < 58; t += 0.37) {
    const p = beatPosition(a, t);
    assert.ok(p > prev, "monotonic");
    prev = p;
  }
  // on a true beat time the fractional part is ~0
  for (const k of [10, 40, 80]) {
    const frac = beatPosition(a, 0.3 + k * spb) % 1;
    const err = Math.min(frac, 1 - frac);
    assert.ok(err < 0.12, `beat ${k} off by ${err}`);
  }
});

test("beat detect: silence and short clips do not throw and give sane values", () => {
  const a = analyzeBeats(new Float32Array(SR * 2), SR);
  assert.ok(a.bpm >= 70 && a.bpm <= 180);
  assert.ok(Number.isFinite(a.offset));
  const b = analyzeBeats(new Float32Array(10), SR);
  assert.ok(Number.isFinite(beatPosition(b, 0.5)));
  assert.ok(energyAt(a, 0.3) >= 0);
});

test("energy curve: louder section reads higher", () => {
  const x = track(120, 0.1, 20);
  for (let i = SR * 10; i < x.length; i++) x[i] *= 0.2;
  const a = analyzeBeats(x, SR);
  assert.ok(energyAt(a, 5) > energyAt(a, 15) + 0.2);
});
