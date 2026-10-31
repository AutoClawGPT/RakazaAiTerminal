"use client";

import { useEffect, useRef, useState } from "react";
import { attachStream, stopAudio } from "@/lib/stage/audio-bus";

type Status = { owner: boolean; missing?: string[] };
type CallLike = { hangup: () => Promise<void> | void; remoteStream$: { subscribe: (fn: (s: MediaStream | null) => void) => { unsubscribe: () => void } }; status$: { subscribe: (fn: (s: string) => void) => { unsubscribe: () => void } } };

/**
 * Owner-only "Go live": connects the SignalWire AI agent (her voice brain) and drives the existing VRM stage's
 * lip sync from the agent's audio via the audio bus. Renders nothing for normal visitors.
 */
export function GoLive() {
  const [st, setSt] = useState<Status | null>(null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [msg, setMsg] = useState("");
  const call = useRef<CallLike | null>(null);
  const subs = useRef<{ unsubscribe: () => void }[]>([]);

  useEffect(() => {
    fetch("/api/live/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Status) => setSt(j))
      .catch(() => setSt({ owner: false }));
    return () => void end();
  }, []);

  async function end() {
    subs.current.forEach((s) => s.unsubscribe());
    subs.current = [];
    try {
      await call.current?.hangup();
    } catch {}
    call.current = null;
    stopAudio();
    setPhase("idle");
  }

  async function start() {
    setPhase("connecting");
    setMsg("");
    try {
      const r = await fetch("/api/live/token", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.missing?.length ? `missing ${j.missing.join(", ")}` : j.error || `token ${r.status}`);
      const { SignalWire, StaticCredentialProvider } = await import("@signalwire/js");
      const client = new SignalWire(new StaticCredentialProvider({ token: j.token }));
      const c = (await client.dial(j.address, { audio: true, video: false, receiveAudio: true, receiveVideo: false })) as unknown as CallLike;
      call.current = c;
      let detach: (() => void) | null = null;
      subs.current.push(
        c.remoteStream$.subscribe((s) => {
          if (s && s.getAudioTracks().length) {
            detach?.();
            detach = attachStream(s);
            setPhase("live");
          }
        }),
        c.status$.subscribe((s) => {
          setMsg(s);
          if (s === "disconnected" || s === "destroyed" || s === "failed") void end();
        }),
      );
    } catch (e) {
      setPhase("error");
      setMsg((e as Error).message);
    }
  }

  if (!st?.owner) return null;
  return (
    <section className="rk-card rk-card-hard" aria-labelledby="live-owner" data-testid="go-live">
      <span className="rk-pill !min-h-7 text-[0.7rem]">OWNER ONLY</span>
      <h2 id="live-owner" className="rk-h2 mt-3 text-xl">
        Go live (SignalWire voice)
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Connects her SignalWire AI voice. Talk into your mic; she answers and her mouth moves with her voice.</p>
      {st.missing?.length ? <p className="mt-2 font-mono text-xs text-amber-600">Setup needed: {st.missing.join(", ")}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {phase === "live" || phase === "connecting" ? (
          <button type="button" className="rk-btn" onClick={() => void end()}>
            End live
          </button>
        ) : (
          <button type="button" className="rk-btn rk-btn-honey" onClick={() => void start()} disabled={!!st.missing?.length}>
            Go live
          </button>
        )}
        <span className="font-mono text-xs" data-testid="go-live-state">
          {phase}
          {msg ? ` · ${msg}` : ""}
        </span>
      </div>
    </section>
  );
}
