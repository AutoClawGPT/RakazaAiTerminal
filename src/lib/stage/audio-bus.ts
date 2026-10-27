"use client";
/**
 * Audio level bus for lip-sync.
 *
 * Every source (microphone, an <audio> element playing her TTS voice, or the silent demo voice)
 * is routed through a Web Audio AnalyserNode. The stage reads `readLevel()` once per frame and
 * maps it to the mouth blendshape. Nothing here records or uploads audio.
 */
import { useSyncExternalStore } from "react";

export type AudioSource = "none" | "mic" | "element" | "demo";

type Active = {
  kind: AudioSource;
  ctx: AudioContext;
  analyser: AnalyserNode;
  buf: Uint8Array<ArrayBuffer>;
  stop: () => void;
};

let active: Active | null = null;
let smoothed = 0;
const bands = { low: 0, mid: 0, high: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function makeAnalyser(ctx: AudioContext) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.55;
  return { analyser, buf: new Uint8Array(new ArrayBuffer(analyser.fftSize)) };
}

function setActive(next: Active | null) {
  active?.stop();
  active = next;
  smoothed = 0;
  bands.low = bands.mid = bands.high = 0;
  emit();
}

/** 0..1 mouth-open level. Cheap enough to call every animation frame. */
export function readLevel(): number {
  if (!active) {
    smoothed *= 0.85;
    bands.low *= 0.85;
    bands.mid *= 0.85;
    bands.high *= 0.85;
    return smoothed;
  }
  active.analyser.getByteTimeDomainData(active.buf);
  let sum = 0;
  for (let i = 0; i < active.buf.length; i++) {
    const v = (active.buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / active.buf.length);
  updateBands(active);
  const target = Math.min(1, Math.max(0, (rms - 0.015) * 7));
  smoothed += (target - smoothed) * 0.45;
  return smoothed;
}

/** Spectrum split of the voice (0..1 each), updated by readLevel(); used to pick vowel shapes. */
export function readBands(): { low: number; mid: number; high: number } {
  return bands;
}

function updateBands(a: Active) {
  const fd = new Uint8Array(a.analyser.frequencyBinCount);
  a.analyser.getByteFrequencyData(fd);
  const hz = a.ctx.sampleRate / a.analyser.fftSize;
  const avg = (f0: number, f1: number) => {
    const i0 = Math.max(1, Math.floor(f0 / hz));
    const i1 = Math.min(fd.length - 1, Math.ceil(f1 / hz));
    let s = 0;
    for (let i = i0; i <= i1; i++) s += fd[i];
    return s / Math.max(1, i1 - i0 + 1) / 255;
  };
  bands.low += (avg(100, 700) - bands.low) * 0.4;
  bands.mid += (avg(700, 2200) - bands.mid) * 0.4;
  bands.high += (avg(2200, 6000) - bands.high) * 0.4;
}

export async function startMic(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const { analyser, buf } = makeAnalyser(ctx);
  src.connect(analyser); // not connected to destination: no feedback
  setActive({
    kind: "mic",
    ctx,
    analyser,
    buf,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  });
}

/** Route an <audio>/<video> element (her TTS voice) through the analyser, still audible. */
export function attachElement(el: HTMLMediaElement): () => void {
  const ctx = new AudioContext();
  const src = ctx.createMediaElementSource(el);
  const { analyser, buf } = makeAnalyser(ctx);
  src.connect(analyser);
  analyser.connect(ctx.destination);
  setActive({ kind: "element", ctx, analyser, buf, stop: () => void ctx.close() });
  return stopAudio;
}

/** Silent speech-like signal, only to test the lip-sync path. Never reaches the speakers. */
export function startDemo(): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 140;
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 4.2; // syllable rate
  lfoGain.gain.value = 0.25;
  gain.gain.value = 0.3;
  lfo.connect(lfoGain).connect(gain.gain);
  osc.connect(gain);
  const { analyser, buf } = makeAnalyser(ctx);
  gain.connect(analyser); // analyser only, no destination
  osc.start();
  lfo.start();
  setActive({ kind: "demo", ctx, analyser, buf, stop: () => void ctx.close() });
}

/** True while any source (her voice, mic, demo) is feeding the analyser. */
export function hasAudio(): boolean {
  return active !== null;
}

export function stopAudio(): void {
  setActive(null);
}

export function useAudioSource(): AudioSource {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active?.kind ?? "none",
    () => "none" as AudioSource,
  );
}
