"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Minus, Plus, RotateCcw, Volume2 } from "lucide-react";
import { CssAvatar } from "./css-avatar";
import { StageLights } from "./stage-lights";
import { ClubScene } from "./club-scene";
import { setBold } from "@/lib/stage/motion-bus";
import { stopSong } from "@/lib/stage/song-player";
import { cancelPrep } from "@/lib/stage/song-prep";
import type { StageHandle, StageVariant } from "./stage-canvas";
import { startDemo, startMic, stopAudio, useAudioSource } from "@/lib/stage/audio-bus";

const StageCanvas = dynamic(() => import("./stage-canvas"), { ssr: false });

/** Avatar: AvatarSample_B by VRoid Project (VRoid Hub licence: commercial use, modification and redistribution allowed, no credit needed). See /public/avatar/LICENSE.md */
const DEFAULT_SRC = "/avatar/sample_b.vrm";

let webglCache: boolean | null = null;
function detectWebGL() {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
}
const noopSub = () => () => {};
function useWebGL(): boolean | null {
  return useSyncExternalStore(noopSub, detectWebGL, () => null);
}

type Props = {
  variant?: StageVariant;
  className?: string;
  src?: string;
  /** zoom / reset / 2D-3D / mic test buttons */
  controls?: "none" | "basic" | "full";
  wheelZoom?: boolean;
  controlsClassName?: string;
  children?: React.ReactNode;
  /** lower pixel ratio (phones, small panels). Still renders the full 3D model. */
  lite?: boolean;
  /** reports "loading" | "ready" | "fallback" so a parent can show the real state */
  onState?: (s: "loading" | "ready" | "fallback") => void;
};

export function CharacterStage({ variant = "panel", className = "", src = DEFAULT_SRC, controls = "basic", wheelZoom = false, controlsClassName = "bottom-3 left-3", children, lite = false, onState }: Props) {
  const webgl = useWebGL();
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [visible, setVisible] = useState(true);
  const [micErr, setMicErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<StageHandle | null>(null);
  const audio = useAudioSource();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      stopAudio();
      stopSong(); // closing the stage (widget closed, page left) ends her song
      cancelPrep();
      setBold(false); // leaving the stage ends the 18+ club
    };
  }, []);

  const onReady = useCallback(() => setStatus("ready"), []);
  const onFail = useCallback((why: string) => {
    console.warn("[stage] falling back to 2D:", why);
    setStatus("failed");
  }, []);

  const use3d = webgl === true && mode === "3d" && status !== "failed";
  const state = webgl === null ? "loading" : !use3d ? "fallback" : status === "ready" ? "ready" : "loading";

  useEffect(() => {
    onState?.(state);
  }, [state, onState]);

  async function toggleMic() {
    setMicErr(null);
    if (audio === "mic") return stopAudio();
    try {
      await startMic();
    } catch {
      setMicErr("Microphone blocked");
    }
  }

  return (
    <div ref={ref} className={`rk-stage relative overflow-hidden ${className}`} data-stage-state={state} data-stage-variant={variant}>
      <ClubScene layer="back" />
      <StageLights />
      {use3d ? <StageCanvas variant={variant} src={src} lite={lite} wheelZoom={wheelZoom} visible={visible} onReady={onReady} onFail={onFail} handleRef={handle} /> : null}
      <ClubScene layer="front" />
      {!use3d && webgl !== null ? (
        <div className="absolute inset-0 grid place-items-end px-6 pt-10 pb-0">
          <CssAvatar className="max-h-full" />
        </div>
      ) : null}
      {use3d && status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-live="polite">
          <span className="rk-pill !min-h-8 animate-pulse text-xs">Waking Rakaza up…</span>
        </div>
      ) : null}
      {children}
      {controls !== "none" ? (
        <div className={`absolute z-20 flex flex-wrap items-center gap-2 ${controlsClassName}`}>
          {webgl ? (
            <div className="inline-flex overflow-hidden rounded-full border-2 border-[var(--rk-ink)] bg-white text-[0.7rem] font-bold text-[var(--rk-ink)]" role="group" aria-label="Render mode">
              <button type="button" className="min-h-8 px-3" data-active={mode === "3d"} style={mode === "3d" ? { background: "var(--rk-honey)" } : undefined} onClick={() => setMode("3d")} aria-pressed={mode === "3d"}>
                3D
              </button>
              <button type="button" className="min-h-8 px-3" style={mode === "2d" ? { background: "var(--rk-honey)" } : undefined} onClick={() => setMode("2d")} aria-pressed={mode === "2d"}>
                2D
              </button>
            </div>
          ) : null}
          {use3d && status === "ready" ? (
            <div className="inline-flex gap-1">
              <button type="button" className="rk-icon-btn !size-8" aria-label="Zoom in" onClick={() => handle.current?.zoom(1)}>
                <Plus className="size-4" />
              </button>
              <button type="button" className="rk-icon-btn !size-8" aria-label="Zoom out" onClick={() => handle.current?.zoom(-1)}>
                <Minus className="size-4" />
              </button>
              <button type="button" className="rk-icon-btn !size-8" aria-label="Reset view" onClick={() => handle.current?.reset()}>
                <RotateCcw className="size-4" />
              </button>
            </div>
          ) : null}
          {controls === "full" ? (
            <div className="inline-flex gap-1">
              <button type="button" className="rk-icon-btn !size-8" aria-pressed={audio === "demo"} aria-label={audio === "demo" ? "Stop lip-sync test" : "Test lip-sync (silent)"} title="Test lip-sync (silent)" onClick={() => (audio === "demo" ? stopAudio() : startDemo())}>
                <Volume2 className="size-4" />
              </button>
              <button type="button" className="rk-icon-btn !size-8" aria-pressed={audio === "mic"} aria-label={audio === "mic" ? "Stop microphone" : "Mouth follows my microphone"} title="Mouth follows my microphone" onClick={toggleMic}>
                {audio === "mic" ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            </div>
          ) : null}
          {micErr ? <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-bold text-[var(--rk-ink)]">{micErr}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
