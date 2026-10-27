"use client";
/**
 * Motion bus: tells every 3D stage what Rakaza is doing (idle / sing / dance) and whether the
 * age-gated 18+ style is on. The stages read it once per frame; React UI subscribes to it.
 * Sing and Dance also start the synth backing track (src/lib/stage/music.ts), which the choreography
 * locks onto. Nothing here records audio or touches the network.
 */
import { useSyncExternalStore } from "react";
import { setMusicEnabled, startMusic, stopMusic } from "./music";

export type Motion = "idle" | "sing" | "dance";
type State = { motion: Motion; bold: boolean; since: number };

let state: State = { motion: "idle", bold: false, since: 0 };
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getMotion(): State {
  return state;
}

/** Start a motion; it returns to idle on its own after `ms` (default 14 s). */
export function playMotion(motion: Motion, ms = 14000) {
  if (timer) clearTimeout(timer);
  timer = null;
  state = { ...state, motion, since: typeof performance !== "undefined" ? performance.now() : 0 };
  if (motion === "idle") stopMusic();
  else startMusic(motion);
  emit();
  if (motion !== "idle") {
    timer = setTimeout(() => {
      timer = null;
      state = { ...state, motion: "idle" };
      stopMusic();
      emit();
    }, ms);
  }
}

/** Her backing track on/off (follows the voice mute button). The dance and sing motions still play silently. */
export function setSoundOn(on: boolean) {
  setMusicEnabled(on);
}

/** 18+ style. Only ever turned on from the age-gated Talk screen. */
export function setBold(bold: boolean) {
  state = { ...state, bold };
  emit();
}

export function useMotion(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
