/**
 * Beat detection for the dance: pure functions, no Web Audio. Give it the mono samples of a decoded song and
 * it returns the tempo, a beat grid and a loudness curve, so the choreography can lock to the real song.
 *
 * Method: a 10 ms onset-strength curve (bass energy flux + high-frequency flux), a comb search over 70..180 BPM
 * (with a mild prior around 118 BPM so octave errors land in a dance-able range), then a tracking pass that nudges
 * every beat of the grid toward the nearest strong onset so slow tempo drift does not de-sync the steps.
 */

export type BeatAnalysis = {
  /** estimated tempo */
  bpm: number;
  /** time of the first beat in seconds (0..one beat) */
  offset: number;
  /** how much stronger the best tempo is than the average candidate (>1.2 is a clear pulse) */
  confidence: number;
  /** beat times in seconds, ascending, one per beat */
  grid: number[];
  /** loudness 0..1 every `energyHop` seconds */
  energy: Float32Array;
  energyHop: number;
  duration: number;
};

const FRAME = 0.01; // onset curve resolution, seconds
export const MIN_BPM = 70;
export const MAX_BPM = 180;

/** true length of one onset frame in seconds (the hop is a whole number of samples) */
export const frameSec = (sr: number) => Math.max(1, Math.round(sr * FRAME)) / sr;

/** onset strength per 10 ms frame */
export function onsetCurve(x: Float32Array, sr: number): Float32Array {
  const hop = Math.max(1, Math.round(sr * FRAME));
  const frames = Math.floor(x.length / hop);
  const env = new Float32Array(frames);
  // one-pole lowpass (~180 Hz) for kick/bass; first difference for hats/snare
  const a = 1 - Math.exp((-2 * Math.PI * 180) / sr);
  let lp = 0;
  let prevX = 0;
  let pLow = 0;
  let pHigh = 0;
  for (let f = 0; f < frames; f++) {
    let eLow = 0;
    let eHigh = 0;
    const s = f * hop;
    for (let i = 0; i < hop; i++) {
      const v = x[s + i];
      lp += a * (v - lp);
      eLow += lp * lp;
      const d = v - prevX;
      prevX = v;
      eHigh += d * d;
    }
    eLow = Math.log1p((eLow / hop) * 4000);
    eHigh = Math.log1p((eHigh / hop) * 1500);
    const fl = Math.max(0, eLow - pLow);
    const fh = Math.max(0, eHigh - pHigh);
    pLow = eLow;
    pHigh = eHigh;
    env[f] = fl * 1.0 + fh * 0.7;
  }
  // remove the slow-moving mean (0.6 s) so only peaks remain
  const w = Math.round(0.3 / frameSec(sr));
  const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + env[i];
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const lo = Math.max(0, i - w);
    const hi = Math.min(frames, i + w + 1);
    out[i] = Math.max(0, env[i] - ((pre[hi] - pre[lo]) / (hi - lo)) * 1.05);
  }
  return out;
}

function combScore(env: Float32Array, periodFrames: number, phase: number): number {
  let sum = 0;
  let n = 0;
  for (let p = phase; p < env.length - 1; p += periodFrames) {
    const i = Math.round(p);
    sum += Math.max(env[i - 1] ?? 0, env[i], env[i + 1] ?? 0);
    n++;
  }
  return n ? sum / n : 0;
}

const prior = (bpm: number) => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.7, 2));

export function analyzeBeats(x: Float32Array, sr: number): BeatAnalysis {
  const duration = x.length / sr;
  const env = onsetCurve(x, sr);
  const fs = frameSec(sr);
  const energy = energyCurve(x, sr, 0.1);
  let best = { bpm: 120, phase: 0, score: 0 };
  let sumScore = 0;
  let count = 0;
  if (env.length > 300) {
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
      const P = 60 / bpm / fs;
      let bs = 0;
      let bp = 0;
      const step = Math.max(1, Math.floor(P / 60));
      for (let ph = 0; ph < P; ph += step) {
        const sc = combScore(env, P, ph);
        if (sc > bs) {
          bs = sc;
          bp = ph;
        }
      }
      const sc = bs * (0.55 + 0.45 * prior(bpm));
      sumScore += sc;
      count++;
      if (sc > best.score) best = { bpm, phase: bp, score: sc };
    }
    // refine tempo to 0.1 BPM around the winner (same scoring)
    for (let bpm = best.bpm - 0.6; bpm <= best.bpm + 0.6; bpm += 0.1) {
      const P = 60 / bpm / fs;
      for (let ph = best.phase - 3; ph <= best.phase + 3; ph++) {
        const pp = ((ph % P) + P) % P;
        const sc = combScore(env, P, pp) * (0.55 + 0.45 * prior(bpm));
        if (sc > best.score) best = { bpm, phase: pp, score: sc };
      }
    }
  }
  const bpm = best.bpm;
  const period = 60 / bpm;
  const offset = (best.phase * fs) % period;
  const grid = buildGrid(env, offset, period, duration, fs);
  return { bpm, offset, confidence: count ? best.score / Math.max(1e-9, sumScore / count) : 0, grid, energy, energyHop: 0.1, duration };
}

/** One beat time per beat; each is pulled 40% toward the strongest onset within +-0.15 period of its prediction. */
export function buildGrid(env: Float32Array, offset: number, period: number, duration: number, fs = FRAME): number[] {
  const grid: number[] = [];
  let t = offset;
  while (t < duration + period) {
    const c = Math.round(t / fs);
    const r = Math.max(1, Math.round((period * 0.15) / fs));
    let bi = c;
    let bv = -1;
    for (let i = Math.max(0, c - r); i <= Math.min(env.length - 1, c + r); i++) {
      if (env[i] > bv) {
        bv = env[i];
        bi = i;
      }
    }
    let tt = t;
    if (bv > 0) tt = t + 0.4 * (bi * fs - t);
    grid.push(tt);
    t = tt + period; // tempo stays fixed, only the phase is corrected
  }
  return grid;
}

/** Continuous beat position (1.0 = first beat) for a playback time. Uses the tracked grid. */
export function beatPosition(a: Pick<BeatAnalysis, "grid" | "bpm">, time: number): number {
  const g = a.grid;
  if (g.length < 2) return Math.max(0, time) * (a.bpm / 60);
  if (time <= g[0]) return (time - g[0]) * (a.bpm / 60);
  if (time >= g[g.length - 1]) return g.length - 1 + (time - g[g.length - 1]) * (a.bpm / 60);
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid] <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - g[lo]) / (g[hi] - g[lo]);
}

/** loudness curve, 0..1 (95th percentile = 1), lightly smoothed */
export function energyCurve(x: Float32Array, sr: number, hopSec: number): Float32Array {
  const hop = Math.max(1, Math.round(sr * hopSec));
  const n = Math.max(1, Math.floor(x.length / hop));
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < hop; i++) {
      const v = x[f * hop + i] ?? 0;
      s += v * v;
    }
    e[f] = Math.sqrt(s / hop);
  }
  const sorted = Array.from(e).sort((p, q) => p - q);
  const ref = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.95)] ?? 1);
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, e[i] / ref);
    prev += (v - prev) * 0.3;
    out[i] = prev;
  }
  return out;
}

export function energyAt(a: Pick<BeatAnalysis, "energy" | "energyHop">, time: number): number {
  const i = Math.floor(Math.max(0, time) / a.energyHop);
  return a.energy[Math.min(a.energy.length - 1, i)] ?? 0.5;
}

/** Mix an AudioBuffer-like (channels) down to mono and decimate to roughly 22 kHz for cheaper analysis. */
export function toMono(channels: Float32Array[], sr: number): { data: Float32Array; sr: number } {
  const dec = Math.max(1, Math.round(sr / 22050));
  const len = Math.floor(channels[0].length / dec);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let c = 0; c < channels.length; c++) {
      for (let k = 0; k < dec; k++) s += channels[c][i * dec + k] ?? 0;
    }
    out[i] = s / (channels.length * dec);
  }
  return { data: out, sr: sr / dec };
}
