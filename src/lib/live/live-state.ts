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

/* ── Sigmond-style avatar state + Live Wire (additive) ───────────────────────────── */
export type AvatarMode = "idle" | "listening" | "thinking" | "talking";
export type WireEvent = { src: "sdk" | "agent" | "tool" | "browser"; type: string; text: string; at: number };
export type AvatarState = { mode: AvatarMode; since: number; caption: string; wire: WireEvent[] };

let av: AvatarState = { mode: "idle", since: 0, caption: "", wire: [] };
const avSubs = new Set<() => void>();
const avEmit = () => avSubs.forEach((f) => f());
const AV_SERVER: AvatarState = { mode: "idle", since: 0, caption: "", wire: [] };

/** Read once per frame by the 3D stage (no React). */
export function getAvatar(): AvatarState {
  return av;
}
export function setAvatarMode(mode: AvatarMode) {
  if (av.mode === mode) return;
  av = { ...av, mode, since: Date.now() };
  pushWire({ src: "browser", type: `state.${mode}`, text: mode === "listening" ? "user speaking" : mode === "thinking" ? "AI processing" : mode === "talking" ? "agent speaking" : "idle" });
}
export function setCaption(caption: string) {
  av = { ...av, caption };
  avEmit();
}
export function pushWire(e: Omit<WireEvent, "at">) {
  av = { ...av, wire: [...av.wire, { ...e, at: Date.now() }].slice(-40) };
  avEmit();
}
export function resetAvatar() {
  av = { mode: "idle", since: Date.now(), caption: "", wire: [] };
  avEmit();
}
export function useAvatar(): AvatarState {
  return useSyncExternalStore(
    (f) => (avSubs.add(f), () => void avSubs.delete(f)),
    () => av,
    () => AV_SERVER,
  );
}
