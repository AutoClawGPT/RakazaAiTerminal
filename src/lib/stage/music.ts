"use client";
/**
 * Tiny synth backing track (kick, snare, hats, bass, plucks) for Sing and Dance, plus the beat clock the
 * animation locks onto. Everything is generated with the Web Audio API: no files, no network.
 * The track plays straight to the speakers, NOT through the lip-sync analyser, so only her voice moves her mouth.
 * If sound is off (or blocked by the browser) the beat clock keeps running from the performance clock,
 * so she still dances in time with the same tempo.
 */

export type MusicKind = "sing" | "dance";
const BPM: Record<MusicKind, number> = { sing: 96, dance: 112 };

type Run = { kind: MusicKind; ctx: AudioContext | null; t0: number; startMs: number; master: GainNode | null; timer: ReturnType<typeof setInterval> | null; nextBeat: number; noise: AudioBuffer | null };
let run: Run | null = null;
let enabled = true;

export function setMusicEnabled(on: boolean) {
  enabled = on;
  if (!on && run?.master && run.ctx) run.master.gain.setTargetAtTime(0, run.ctx.currentTime, 0.05);
  if (on && run?.master && run.ctx) run.master.gain.setTargetAtTime(0.5, run.ctx.currentTime, 0.05);
}

const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function note(ctx: AudioContext, dest: AudioNode, when: number, freq: number, dur: number, type: OscillatorType, gain: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + dur + 0.05);
}
function kick(ctx: AudioContext, dest: AudioNode, when: number, gain: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, when);
  o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + 0.25);
}
function noiseHit(ctx: AudioContext, dest: AudioNode, buf: AudioBuffer, when: number, dur: number, gain: number, hp: number) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(when);
  s.stop(when + dur + 0.02);
}

function scheduleBeat(r: Run, beatIdx: number, when: number) {
  const ctx = r.ctx;
  const dest = r.master;
  if (!ctx || !dest || !r.noise) return;
  const spb = 60 / BPM[r.kind];
  const bar = Math.floor(beatIdx / 4) % 4;
  const inBar = beatIdx % 4;
  const chord = CHORDS[bar];
  if (r.kind === "dance") {
    kick(ctx, dest, when, 0.9);
    if (inBar === 1 || inBar === 3) noiseHit(ctx, dest, r.noise, when, 0.14, 0.35, 1500);
    noiseHit(ctx, dest, r.noise, when + spb / 2, 0.05, 0.22, 7000);
    note(ctx, dest, when, mtof(chord[0] - 24), spb * 0.9, "sawtooth", 0.2);
    note(ctx, dest, when + spb / 2, mtof(chord[0] - 12), spb * 0.4, "sawtooth", 0.14);
  } else {
    if (inBar === 0 || inBar === 2) kick(ctx, dest, when, 0.55);
    if (inBar === 1 || inBar === 3) noiseHit(ctx, dest, r.noise, when, 0.1, 0.18, 2500);
    note(ctx, dest, when, mtof(chord[0] - 24), spb * 1.8, "triangle", 0.3);
  }
  // arpeggio on eighths
  const pat = [0, 1, 2, 1, 2, 1, 0, 2];
  for (let h = 0; h < 2; h++) {
    const n = chord[pat[(inBar * 2 + h) % 8] % 3] + (inBar === 3 && h === 1 ? 12 : 0);
    note(ctx, dest, when + (h * spb) / 2, mtof(n + 12), spb * 0.5, "triangle", r.kind === "dance" ? 0.16 : 0.2);
  }
  // chord pad on the first beat of each bar
  if (inBar === 0) chord.forEach((n) => note(ctx, dest, when, mtof(n), spb * 3.8, "sine", 0.07));
}

export function startMusic(kind: MusicKind) {
  stopMusic();
  const r: Run = { kind, ctx: null, t0: 0, startMs: performance.now(), master: null, timer: null, nextBeat: 0, noise: null };
  run = r;
  if (!enabled || typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    r.ctx = ctx;
    void ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    r.master = master;
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    r.noise = buf;
    r.t0 = ctx.currentTime + 0.12;
    r.nextBeat = 0;
    const spb = 60 / BPM[kind];
    r.timer = setInterval(() => {
      if (!r.ctx) return;
      while (r.t0 + r.nextBeat * spb < r.ctx.currentTime + 0.25) {
        scheduleBeat(r, r.nextBeat, r.t0 + r.nextBeat * spb);
        r.nextBeat++;
      }
    }, 40);
  } catch {
    r.ctx = null;
  }
}

export function stopMusic() {
  const r = run;
  run = null;
  if (!r) return;
  if (r.timer) clearInterval(r.timer);
  if (r.ctx && r.master) {
    r.master.gain.setTargetAtTime(0, r.ctx.currentTime, 0.08);
    const c = r.ctx;
    setTimeout(() => void c.close().catch(() => {}), 600);
  }
}

export function isMusicPlaying(): boolean {
  return !!run?.ctx && run.ctx.state === "running" && enabled;
}

/** Beats since the motion started, locked to the audio clock when the music is audible. */
export function beatNow(kind: MusicKind | "none", sinceMs: number): { beat: number; bpm: number } {
  const bpm = kind === "none" ? BPM.dance : BPM[kind];
  if (run && run.ctx && run.ctx.state === "running" && run.kind === kind) {
    return { beat: Math.max(0, (run.ctx.currentTime - run.t0) * (bpm / 60)), bpm };
  }
  return { beat: Math.max(0, ((performance.now() - sinceMs) / 1000) * (bpm / 60)), bpm };
}
