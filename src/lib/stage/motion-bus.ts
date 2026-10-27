"use client";
/**
 * Stage bus: the one place the UI talks to the 3D stage.
 *  - songs: she performs ONE thing, the song that is playing (lip-sync, beat-synced dance, stage lights)
 *  - 18+ club: an age-gated flag that changes the stage scene and swaps in the slow sultry choreography
 * The stage reads it once per frame; React UI subscribes through useStage(). Nothing here records audio or touches the network.
 */
import { useSyncExternalStore } from "react";
import { stopSong, toggleSong } from "./song-player";
import { beginSongRequest, cancelPrep } from "./song-prep";
import type { SongDef } from "../songs";

type State = { bold: boolean; /** age gate confirmed for this browser session */ confirmed: boolean };

let state: State = { bold: false, confirmed: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getStage(): State {
  return state;
}

/** Song picker click: start this song (the stage performs it as soon as it plays), or stop it if it is the one playing. */
export function pressSong(def: SongDef) {
  cancelPrep();
  toggleSong(def);
}

/** Chat (or the "Sing for me" button) asked for a song: she gets ready (about five seconds), then performs a songbook song. */
export function requestSong(topic: string | null) {
  stopSong();
  return beginSongRequest(topic);
}

/** Stop whatever she is performing. */
export function stopPerformance() {
  cancelPrep();
  stopSong();
}

const KEY = "rk-18-ok";
/** Has this browser session already passed the 18+ gate? */
export function isAdultConfirmed(): boolean {
  if (state.confirmed) return true;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(KEY) === "1") {
      state = { ...state, confirmed: true };
      return true;
    }
  } catch {
    /* storage blocked: the in-memory flag still works */
  }
  return false;
}

/** The user ticked "I am 18 or older" and pressed Enter in the gate dialog. */
export function confirmAdult() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  state = { ...state, confirmed: true };
  emit();
}

/** 18+ club on or off. Only turned on after the age gate (see AdultToggle). */
export function setBold(bold: boolean) {
  if (bold && !isAdultConfirmed()) return;
  if (state.bold === bold) return;
  state = { ...state, bold };
  emit();
}

export function useStage(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
