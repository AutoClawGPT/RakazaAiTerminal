"use client";
/**
 * Plays one of Rakaza's songs and exposes, per animation frame, everything the 3D stage needs to perform it:
 *  - the beat position on a beat grid detected from the decoded audio (so steps land on the real beat),
 *  - the song's loudness (calmer / bigger moves),
 *  - mouth values from the live spectrum of what is playing (vocal band first, see lipsync.ts).
 *
 * Flow on a click: the AudioContext is created / resumed inside the click, the mp3 is fetched and decoded once
 * (cached), analysed for tempo, then played through  source -> analyser -> speakers.  Clicking another song restarts
 * with that song, clicking the same one stops it. A token guards every async step so rapid clicks can never leave
 * two songs playing or an old decode starting late.
 */
import { useSyncExternalStore } from "react";
import { analyzeBeats, beatPosition, energyAt, toMono, type BeatAnalysis } from "./beat-detect";
import { newLipState, songLipFrame, type LipState } from "./lipsync";
import { stopAudio } from "./audio-bus";
import { rememberSong, type SongDef } from "../songs";

export type SongStatus = "idle" | "loading" | "playing" | "error";
export type SongState = { id: string | null; status: SongStatus; error?: string };
export type SongFrame = { playing: boolean; beat: number; bpm: number; time: number; energy: number; level: number; low: number; mid: number; high: number };

type Loaded = { buffer: AudioBuffer; analysis: BeatAnalysis };
type Cur = { id: string; source: AudioBufferSourceNode; gain: GainNode; analyser: AnalyserNode; fd: Uint8Array<ArrayBuffer>; startedAt: number; loaded: Loaded; lip: LipState };

let state: SongState = { id: null, status: "idle" };
let ctx: AudioContext | null = null;
let cur: Cur | null = null;
let token = 0;
const cache = new Map<string, Promise<Loaded>>();
const listeners = new Set<() => void>();
const set = (s: SongState) => {
  state = s;
  listeners.forEach((l) => l());
};

export const getSongState = () => state;
export function useSong(): SongState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

function ensureCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  void ctx.resume().catch(() => undefined);
  return ctx;
}

async function load(def: SongDef, c: AudioContext): Promise<Loaded> {
  let p = cache.get(def.id);
  if (!p) {
    p = (async () => {
      const res = await fetch(def.src);
      if (!res.ok) throw new Error(`song file ${res.status}`);
      const buffer = await c.decodeAudioData(await res.arrayBuffer());
      await new Promise((r) => setTimeout(r, 0)); // let the UI paint before the analysis
      const mono = toMono(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate);
      return { buffer, analysis: analyzeBeats(mono.data, mono.sr) };
    })();
    cache.set(def.id, p);
    p.catch(() => cache.delete(def.id));
  }
  return p;
}

function teardown() {
  const c = cur;
  cur = null;
  if (!c) return;
  c.source.onended = null;
  try {
    c.source.stop();
  } catch {
    /* already stopped */
  }
  try {
    c.source.disconnect();
    c.gain.gain.cancelScheduledValues(0);
    c.gain.disconnect();
    c.analyser.disconnect();
  } catch {
    /* ignore */
  }
}

export function stopSong() {
  token++;
  teardown();
  if (state.status !== "idle" || state.id) set({ id: null, status: "idle" });
}

/** Click handler: a different song (or none playing) starts from the top, the same song stops. */
export function toggleSong(def: SongDef): void {
  if (state.id === def.id && (state.status === "playing" || state.status === "loading")) {
    stopSong();
    return;
  }
  void startSong(def);
}

/** Create / resume the audio context. Call inside a click or key press so the song can start later without a tap. */
export function primeSongAudio(): void {
  try {
    const c = ensureCtx();
    if (c.state !== "running") void c.resume().catch(() => undefined);
  } catch {
    /* audio unavailable: startSong reports it */
  }
}

/** Where the song is: seconds played and total length (0 / 0 when nothing plays). */
export function songClock(): { time: number; duration: number } {
  if (!cur) return { time: 0, duration: 0 };
  return { time: Math.max(0, songTime()), duration: cur.loaded.buffer.duration };
}

/** Fill `out` (0..1 each) with log-spaced bars of the song's spectrum, for the equalizer. */
export function songSpectrum(out: number[]): boolean {
  if (!cur || !ctx) return false;
  cur.analyser.getByteFrequencyData(cur.fd);
  const n = out.length;
  const hz = ctx.sampleRate / cur.analyser.fftSize;
  for (let i = 0; i < n; i++) {
    const a = Math.max(1, Math.floor(60 * Math.pow(9000 / 60, i / n) / hz));
    const b = Math.max(a + 1, Math.floor(60 * Math.pow(9000 / 60, (i + 1) / n) / hz));
    let m = 0;
    for (let k = a; k < b && k < cur.fd.length; k++) m = Math.max(m, cur.fd[k]);
    out[i] = Math.min(1, Math.pow(m / 255, 1.4) * (0.85 + (i / n) * 0.5));
  }
  return true;
}

export async function startSong(def: SongDef): Promise<void> {
  const my = ++token;
  teardown();
  // the song and her talking voice never mix: stop any spoken reply and hang up the mic first
  stopAudio();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rk:stop-voice"));
  rememberSong(def.id);
  let c: AudioContext;
  try {
    c = ensureCtx();
  } catch {
    set({ id: null, status: "error", error: "Audio is not available in this browser." });
    return;
  }
  set({ id: def.id, status: "loading" });
  try {
    const loaded = await load(def, c);
    if (my !== token) return; // another click happened while loading
    const source = c.createBufferSource();
    source.buffer = loaded.buffer;
    const gain = c.createGain();
    gain.gain.value = 0;
    const analyser = c.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(gain).connect(analyser).connect(c.destination);
    if (c.state !== "running") await c.resume().catch(() => undefined);
    if (my !== token) return;
    const t0 = c.currentTime + 0.03;
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(1, t0 + 0.04); // no click at the start
    source.start(t0);
    cur = { id: def.id, source, gain, analyser, fd: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)), startedAt: t0, loaded, lip: newLipState() };
    source.onended = () => {
      if (my === token) {
        token++;
        teardown();
        set({ id: null, status: "idle" });
      }
    };
    set({ id: def.id, status: "playing" });
  } catch (e) {
    if (my !== token) return;
    cache.delete(def.id);
    teardown();
    set({ id: def.id, status: "error", error: e instanceof Error ? e.message : "Could not play this song." });
    setTimeout(() => {
      if (my === token && state.status === "error") set({ id: null, status: "idle" });
    }, 4000);
  }
}

const SILENT: SongFrame = { playing: false, beat: 0, bpm: 120, time: 0, energy: 0.5, level: 0, low: 0, mid: 0, high: 0 };

/** Playback position in seconds as it is heard (output latency compensated), or -1 when no song is playing. */
export function songTime(): number {
  if (!cur || !ctx) return -1;
  const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
  const t = ctx.currentTime - cur.startedAt - Math.min(0.25, Math.max(0, lat));
  return Math.min(cur.loaded.buffer.duration, t);
}

/** Call once per animation frame while the stage renders. */
export function songFrame(dt: number): SongFrame {
  if (!cur || !ctx) return SILENT;
  const time = songTime();
  if (time < 0) return { ...SILENT, playing: true };
  const a = cur.loaded.analysis;
  cur.analyser.getByteFrequencyData(cur.fd);
  const lip = songLipFrame(cur.fd, ctx.sampleRate / cur.analyser.fftSize, cur.lip, dt);
  // very fast songs dance at half time so the steps stay human
  const half = a.bpm > 150 ? 0.5 : 1;
  return {
    playing: true,
    beat: Math.max(0, beatPosition(a, time)) * half,
    bpm: a.bpm * half,
    time,
    energy: energyAt(a, time),
    level: lip.level,
    low: lip.low,
    mid: lip.mid,
    high: lip.high,
  };
}

if (typeof window !== "undefined" && /[?&]rkdebug/.test(window.location.search)) {
  (window as unknown as { __rkSong: unknown }).__rkSong = {
    state: () => state,
    time: () => (cur && ctx ? ctx.currentTime - cur.startedAt : -1),
    ctxState: () => ctx?.state,
    info: () => (cur ? { bpm: cur.loaded.analysis.bpm, offset: cur.loaded.analysis.offset, conf: cur.loaded.analysis.confidence, beats: cur.loaded.analysis.grid.length, duration: cur.loaded.buffer.duration } : null),
    frame: () => songFrame(0.016),
  };
}
