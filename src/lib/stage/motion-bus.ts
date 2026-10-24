"use client";
/**
 * Motion bus: tells the 3D stage what Rakaza is doing (idle / sing / dance) and whether the
 * age-gated 18+ style is on. The stage reads it once per frame; React UI subscribes to it.
 * Nothing here touches audio or the network.
 */
import { useSyncExternalStore } from "react";

export type Motion = "idle" | "sing" | "dance";
type State = { motion: Motion; bold: boolean };

let state: State = { motion: "idle", bold: false };
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getMotion(): State {
  return state;
}

/** Start a motion; it returns to idle on its own after `ms` (default 14 s). */
export function playMotion(motion: Motion, ms = 14000) {
  if (timer) clearTimeout(timer);
  state = { ...state, motion };
  emit();
  if (motion !== "idle") {
    timer = setTimeout(() => {
      state = { ...state, motion: "idle" };
      emit();
    }, ms);
  }
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
