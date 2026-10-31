"use client";
/** Tiny client store for the live show: on-air flag, start time and the live chat feed. Shared by Go live, badges and the dashboard. */
import { useSyncExternalStore } from "react";

export type LiveChatLine = { who: "you" | "rakaza"; text: string; at: number };
export type LiveState = { live: boolean; since: number | null; chat: LiveChatLine[] };

let state: LiveState = { live: false, since: null, chat: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const SERVER: LiveState = { live: false, since: null, chat: [] };

export function setLive(live: boolean) {
  if (state.live === live) return;
  state = { ...state, live, since: live ? Date.now() : null };
  emit();
}
export function pushChat(line: Omit<LiveChatLine, "at">) {
  state = { ...state, chat: [...state.chat, { ...line, at: Date.now() }].slice(-50) };
  emit();
}
export function useLive(): LiveState {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
    () => SERVER,
  );
}
