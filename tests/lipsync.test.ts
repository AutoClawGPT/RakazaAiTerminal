import test from "node:test";
import assert from "node:assert/strict";
import { newLipState, songLipFrame } from "../src/lib/stage/lipsync";

const BINS = 512;
const HZ = 22050 / BINS / 1; // fftSize 1024 at 44.1k -> 43 Hz/bin
function spec(peaks: [number, number][], floor = 40): Uint8Array {
  const fd = new Uint8Array(BINS).fill(floor);
  for (const [hz, amp] of peaks) {
    const i = Math.round(hz / HZ);
    for (let k = -2; k <= 2; k++) if (fd[i + k] !== undefined) fd[i + k] = Math.max(fd[i + k], Math.round(amp * (1 - Math.abs(k) * 0.25)));
  }
  return fd;
}
const run = (fd: Uint8Array, frames: number, st = newLipState()) => {
  let f = songLipFrame(fd, HZ, st, 1 / 60);
  for (let i = 1; i < frames; i++) f = songLipFrame(fd, HZ, st, 1 / 60);
  return { f, st };
};

test("lipsync: silence keeps the mouth closed", () => {
  const { f } = run(new Uint8Array(BINS).fill(0), 60);
  assert.ok(f.level < 0.05);
});

test("lipsync: sung phrase opens the jaw, gaps close it", () => {
  const st = newLipState();
  const loud = spec([[500, 230], [1500, 210], [2500, 190]]);
  const quiet = spec([], 8);
  let open = 0;
  let closed = 1;
  for (let rep = 0; rep < 6; rep++) {
    open = Math.max(open, run(loud, 18, st).f.level);
    closed = Math.min(closed, run(quiet, 14, st).f.level);
  }
  assert.ok(open > 0.5, `open ${open}`);
  assert.ok(closed < 0.2, `closed ${closed}`);
});

test("lipsync: bass-only (kick) does not open the jaw as much as vocals", () => {
  const kick = spec([[80, 255], [120, 250]], 5);
  const voice = spec([[600, 240], [1700, 220]], 5);
  const a = run(kick, 40).f.level;
  const b = run(voice, 40).f.level;
  assert.ok(b > a, `voice ${b} vs kick ${a}`);
});

test("lipsync: centroid chooses the vowel (low -> oo/oh, mid -> aa, high -> ee/ih)", () => {
  const low = run(spec([[350, 240], [500, 220]], 20), 80).f;
  const mid = run(spec([[900, 240], [1300, 230]], 20), 80).f;
  const high = run(spec([[2600, 240], [3200, 230]], 20), 80).f;
  assert.ok(low.low > low.high && low.low >= low.mid * 0.8, JSON.stringify(low));
  assert.ok(mid.mid > mid.low && mid.mid > mid.high, JSON.stringify(mid));
  assert.ok(high.high > high.low && high.high > high.mid, JSON.stringify(high));
  assert.ok(low.centroid < mid.centroid && mid.centroid < high.centroid);
});

test("lipsync: a sustained note stays open", () => {
  const { f } = run(spec([[700, 220], [1500, 200]], 30), 600);
  assert.ok(f.level > 0.4, `sustained ${f.level}`);
});

test("lipsync: output is always finite and in range", () => {
  const st = newLipState();
  let seed = 3;
  for (let i = 0; i < 500; i++) {
    const fd = new Uint8Array(BINS).map(() => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) & 255);
    const f = songLipFrame(fd, HZ, st, i % 7 === 0 ? 0 : 1 / 50);
    for (const v of [f.level, f.low, f.mid, f.high, f.centroid]) assert.ok(Number.isFinite(v));
    assert.ok(f.level >= 0 && f.level <= 1);
  }
});
