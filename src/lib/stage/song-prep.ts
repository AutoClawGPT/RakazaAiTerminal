"use client";
/**
 * "Crafting a song for you…": when someone asks Rakaza for a song in chat she gets ready (ready pose, stage
 * lights, a short progress display) and then performs one of her two songbook songs. Nothing is generated: the
 * display is honest about it ("from Rakaza's songbook"). The prep takes about five seconds, then the real song
 * starts with the normal lip-sync / beat-synced dance.
 */
import { useSyncExternalStore } from "react";
import { nextSong, type SongDef } from "../songs";
import { primeSongAudio, startSong } from "./song-player";

export const PREP_MS = 5200;
export const PREP_STEPS = ["Picking from the songbook", "Warming up", "Tuning", "Getting on the beat"] as const;

export type PrepState = { active: boolean; step: number; label: string; progress: number; topic: string | null; song: SongDef | null };
const IDLE: PrepState = { active: false, step: 0, label: "", progress: 0, topic: null, song: null };
let state: PrepState = IDLE;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const set = (s: PrepState) => {
  state = s;
  listeners.forEach((l) => l());
};

export const getPrep = () => state;
export function usePrep(): PrepState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => IDLE,
  );
}

/** Stop a preparation in progress (any other button press, a spoken reply or a Sing / Dance takes over). */
export function cancelPrep() {
  if (timer) clearInterval(timer);
  timer = null;
  if (state.active) set(IDLE);
}

/** Start the preparing display, then play the next songbook song. Call inside a click so audio can start. */
export function beginSongRequest(topic: string | null, ms = PREP_MS): SongDef {
  cancelPrep();
  primeSongAudio();
  const song = nextSong();
  const t0 = Date.now();
  set({ active: true, step: 0, label: PREP_STEPS[0], progress: 0, topic, song });
  timer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    if (k >= 1) {
      cancelPrep();
      void startSong(song);
      return;
    }
    const step = Math.min(PREP_STEPS.length - 1, Math.floor(k * PREP_STEPS.length));
    set({ active: true, step, label: PREP_STEPS[step], progress: k, topic, song });
  }, 100);
  return song;
}
