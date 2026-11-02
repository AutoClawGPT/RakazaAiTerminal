"use client";

import { useEffect, useRef, useState } from "react";
import { attachElement, attachStream, stopAudio } from "@/lib/stage/audio-bus";
import { pushChat, setLive, pushWire, resetAvatar, setAvatarMode, setCaption, getAvatar, setBrain } from "@/lib/live/live-state";

type Status = { owner: boolean; missing?: string[] };
type CallLike = { hangup: () => Promise<void> | void; remoteStream$: { subscribe: (fn: (s: MediaStream | null) => void) => { unsubscribe: () => void } }; status$: { subscribe: (fn: (s: string) => void) => { unsubscribe: () => void } }; subscribe?: (ev: string) => { subscribe: (fn: (e: unknown) => void) => { unsubscribe: () => void } } };

/**
 * Owner-only "Go live": connects the SignalWire AI agent (her voice brain) and drives the existing VRM stage's
 * lip sync from the agent's audio via the audio bus. Renders nothing for normal visitors.
 */
/** Quick probe: can this browser gather any server-reflexive/relay ICE candidate? */
async function hasRoutableIce(ms = 4000): Promise<boolean> {
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.createDataChannel("probe");
    let ok = false;
    pc.onicecandidate = (ev) => {
      if (ev.candidate && /\btyp (srflx|relay|prflx)\b/.test(ev.candidate.candidate)) ok = true;
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => setTimeout(r, ms));
    pc.close();
    return ok;
  } catch {
    return false;
  }
}

/** RMS 0..1 of an analyser right now. */
function rms(a: AnalyserNode, buf: Uint8Array<ArrayBuffer>) {
  a.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += ((v - 128) / 128) ** 2;
  return Math.sqrt(sum / buf.length);
}
const CAPTION: Record<string, string> = { listening: "Listening…", thinking: "Thinking…", talking: "", idle: "" };

/** Turn a SignalWire user_event (from SWML user_event / SWAIG actions) into a Live Wire line and a caption. */
function onUserEvent(raw: unknown) {
  const r = raw as { params?: { event?: Record<string, unknown> } & Record<string, unknown>; event?: Record<string, unknown> };
  const e = (r?.params?.event ?? r?.event ?? r?.params ?? r) as Record<string, unknown> | undefined;
  if (!e || typeof e.type !== "string") return;
  if (e.type === "tool_result") {
    const line = e.tool === "get_top_agents" ? `Top agent: ${e.name} (${e.launches} launches)` : `Newest launch: ${e.name} (${e.symbol})`;
    pushWire({ src: "tool", type: String(e.tool), text: line });
    setCaption(line);
  } else pushWire({ src: "agent", type: e.type, text: JSON.stringify(e).slice(0, 120) });
}

export function GoLive() {
  const [st, setSt] = useState<Status | null>(null);
  /** BEA brain (owner's EC2) is preferred when configured; SignalWire stays as the fallback. */
  const [bea, setBea] = useState(false);
  const beaRun = useRef<{ es: EventSource; el: HTMLAudioElement } | null>(null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [msg, setMsg] = useState("");
  const call = useRef<CallLike | null>(null);
  const subs = useRef<{ unsubscribe: () => void }[]>([]);
  const remote = useRef<MediaStream | null>(null);
  const sink = useRef<HTMLAudioElement | null>(null);
  /** One mixer: her call voice and her chat replies are summed, so a chat reply never cuts the call audio. */
  const mix = useRef<{ ctx: AudioContext; out: MediaStreamAudioDestinationNode; callLevel: AnalyserNode } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Sigmond-style state loop: mic level = listening, gap after the user stops = thinking, her voice = talking. */
  const loop = useRef<{ timer: ReturnType<typeof setInterval>; mic: MediaStream | null } | null>(null);

  async function startStateLoop() {
    const m = mixer();
    let mic: MediaStream | null = null;
    let micA: AnalyserNode | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micA = m.ctx.createAnalyser();
      micA.fftSize = 512;
      m.ctx.createMediaStreamSource(mic).connect(micA);
    } catch {
      pushWire({ src: "browser", type: "mic.unavailable", text: "no mic level; listening state off" });
    }
    const bufC = new Uint8Array(new ArrayBuffer(512));
    const bufM = new Uint8Array(new ArrayBuffer(512));
    let userAt = 0, herAt = 0, userTalked = false;
    const timer = setInterval(() => {
      const now = Date.now();
      const her = rms(m.callLevel, bufC) > 0.02;
      const user = micA ? rms(micA, bufM) > 0.03 : false;
      if (her) herAt = now;
      if (user) { userAt = now; userTalked = true; }
      let mode: "idle" | "listening" | "thinking" | "talking" = "idle";
      if (now - herAt < 350) { mode = "talking"; userTalked = false; }
      else if (now - userAt < 500) mode = "listening";
      else if (userTalked && now - userAt < 8000) mode = "thinking";
      if (mode !== getAvatar().mode) {
        setAvatarMode(mode);
        const cap = getAvatar().caption;
        const toolLine = /^(Top agent|Newest launch)/.test(cap);
        if (mode === "talking") setCaption(toolLine ? cap : "Rakaza is speaking");
        else if (mode !== "idle" || !toolLine) setCaption(CAPTION[mode] ?? "");
      }
    }, 100);
    loop.current = { timer, mic };
  }

  function mixer() {
    if (!mix.current) {
      const ctx = new AudioContext();
      const callLevel = ctx.createAnalyser();
      callLevel.fftSize = 512;
      mix.current = { ctx, out: ctx.createMediaStreamDestination(), callLevel };
      attachStream(mix.current.out.stream);
    }
    void mix.current.ctx.resume();
    return mix.current;
  }

  /** Wait (max 8 s) until her call voice is quiet, so chat replies queue after what she is saying. */
  async function callQuiet() {
    const m = mix.current;
    if (!m) return;
    const buf = new Uint8Array(m.callLevel.fftSize);
    let quiet = 0;
    for (let t = 0; t < 80 && quiet < 6; t++) {
      m.callLevel.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      quiet = Math.sqrt(sum / buf.length) < 0.02 ? quiet + 1 : 0;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  function speak(text: string) {
    queue.current = queue.current.then(async () => {
      const t = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!t.ok) return;
      const m = mixer();
      await callQuiet();
      const buf = await m.ctx.decodeAudioData(await t.arrayBuffer());
      const src = m.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(m.out);
      await new Promise<void>((res) => {
        src.onended = () => res();
        src.start();
      });
    }).catch(() => {});
  }
  const [chat, setChat] = useState<{ who: "you" | "rakaza"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /** Live chat: the message goes to her brain (/api/chat); she shows and speaks the reply, mouth synced, then goes back to the live call audio. */
  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 300);
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    const next = [...chat, { who: "you" as const, text }];
    setChat(next);
    pushChat({ who: "you", text });
    if (beaRun.current) {
      try {
        if (getAvatar().mode !== "talking") setAvatarMode("thinking");
        const r = await fetch("/api/live/bea/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
        const j = (await r.json()) as { reply?: string; mood?: string; error?: string; queued?: boolean };
        const reply = (j.reply ?? "").replace(/<[^>]*>/g, "").trim() || (j.error ? `(${j.error})` : j.queued ? "(got it, she'll answer out loud on stream)" : "(she answered out loud on stream)");
        setChat((c) => [...c, { who: "rakaza", text: reply }]);
        pushChat({ who: "rakaza", text: reply });
        if (j.mood) pushWire({ src: "agent", type: "mood", text: j.mood });
      } catch (err) {
        setChat((c) => [...c, { who: "rakaza", text: (err as Error).message }]);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.slice(-8).map((m) => ({ role: m.who === "you" ? "user" : "assistant", content: m.text })) }) });
      const j = (await r.json()) as { reply?: string; message?: string };
      const reply = j.reply || j.message || `chat ${r.status}`;
      setChat((c) => [...c, { who: "rakaza", text: reply }]);
      pushChat({ who: "rakaza", text: reply });
      if (j.reply) speak(j.reply);
    } catch (err) {
      setChat((c) => [...c, { who: "rakaza", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/live/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Status) => setSt(j))
      .catch(() => setSt({ owner: false }));
    fetch("/api/live/bea/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { bea?: boolean }) => setBea(!!j.bea))
      .catch(() => {});
    return () => void end();
  }, []);

  /** BEA mode: her state, mood and captions come from BEA /stage/stream; her voice is the /listen stream, which also drives lip sync. */
  async function startBea() {
    setPhase("connecting");
    setMsg("");
    resetAvatar();
    const el = new Audio("/api/live/bea/listen");
    el.preload = "none";
    attachElement(el);
    const es = new EventSource("/api/live/bea/stream");
    beaRun.current = { es, el };
    es.onopen = () => {
      setBrain("bea");
      setLive(true);
      setPhase("live");
      setMsg("BEA");
      pushWire({ src: "sdk", type: "bea.stream", text: "BEA stage stream connected" });
    };
    let mood = "";
    es.onmessage = (ev) => {
      let d: { state?: string; mood?: string; caption?: string };
      try {
        d = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (d.state) setAvatarMode(d.state === "talking" ? "talking" : d.state === "thinking" ? "thinking" : d.state === "listening" ? "listening" : "idle");
      // Empty caption patches between sentences would flicker; keep the last line while she is still talking.
      if (typeof d.caption === "string") {
        const cap = d.caption.replace(/<[^>]*>/g, "").trim();
        if (cap) setCaption(cap);
        else if (getAvatar().mode !== "talking") setCaption(getAvatar().mode === "thinking" ? "Thinking…" : "");
      }
      if (d.mood && d.mood !== mood) {
        mood = d.mood;
        pushWire({ src: "agent", type: "mood", text: d.mood });
      }
    };
    es.onerror = () => pushWire({ src: "browser", type: "bea.reconnect", text: "stage stream reconnecting" });
    try {
      await el.play();
    } catch (e) {
      setMsg(`voice: ${(e as Error).message}`);
    }
  }

  async function end() {
    if (beaRun.current) {
      beaRun.current.es.close();
      beaRun.current.el.pause();
      beaRun.current.el.src = "";
      beaRun.current = null;
      setLive(false);
      setBrain("sw");
      resetAvatar();
    }
    const hadCall = !!call.current;
    if (loop.current) {
      clearInterval(loop.current.timer);
      loop.current.mic?.getTracks().forEach((t) => t.stop());
      loop.current = null;
    }
    subs.current.forEach((s) => s.unsubscribe());
    subs.current = [];
    try {
      await call.current?.hangup();
    } catch {}
    call.current = null;
    remote.current = null;
    if (sink.current) sink.current.srcObject = null;
    void mix.current?.ctx.close();
    mix.current = null;
    if (hadCall) {
      setLive(false);
      resetAvatar();
    }
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
      resetAvatar();
      pushWire({ src: "sdk", type: "call.dial", text: "dialing Rakaza agent" });
      const ue = c.subscribe?.("user_event");
      if (ue) subs.current.push(ue.subscribe(onUserEvent));
      let detach: (() => void) | null = null;
      subs.current.push(
        c.remoteStream$.subscribe((s) => {
          if (s && s.getAudioTracks().length) {
            detach?.();
            remote.current = s;
            // Chrome only pulls WebRTC audio into Web Audio when the stream is also bound to a media element (muted: the analyser path plays it).
            sink.current ??= new Audio();
            sink.current.srcObject = s;
            sink.current.muted = true;
            void sink.current.play().catch(() => {});
            const m = mixer();
            const node = m.ctx.createMediaStreamSource(s);
            node.connect(m.out);
            node.connect(m.callLevel);
            detach = () => node.disconnect();
            setLive(true);
            setPhase("live");
            pushWire({ src: "sdk", type: "remoteStream", text: "agent audio attached" });
            if (!loop.current) void startStateLoop();
          }
        }),
        c.status$.subscribe((s) => {
          setMsg(s);
          pushWire({ src: "sdk", type: `status.${s}`, text: s });
          if (s === "disconnected" || s === "destroyed" || s === "failed") void end();
        }),
      );
    } catch (e) {
      setPhase("error");
      const m = (e as Error).message;
      // "Call create timeout" with no invite sent means the browser gathered no non-host ICE candidate (UDP and TURN blocked).
      setMsg(/timeout/i.test(m) && !(await hasRoutableIce()) ? `${m} · this network blocks WebRTC (no UDP/TURN); try another network` : m);
    }
  }

  if (!st?.owner) return null;
  return (
    <section className="rk-card rk-card-hard" aria-labelledby="live-owner" data-testid="go-live">
      <span className="rk-pill !min-h-7 text-[0.7rem]">OWNER ONLY</span>
      <h2 id="live-owner" className="rk-h2 mt-3 text-xl">
        {bea ? "Go live (BEA brain)" : "Go live (SignalWire voice)"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{bea ? "Connects her BEA brain on your EC2. Type in Live chat; she answers out loud and her mouth moves with her voice." : "Connects her SignalWire AI voice. Talk into your mic; she answers and her mouth moves with her voice."}</p>
      {!bea && st.missing?.length ? <p className="mt-2 font-mono text-xs text-amber-600">Setup needed: {st.missing.join(", ")}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {phase === "live" || phase === "connecting" ? (
          <button type="button" className="rk-btn" onClick={() => void end()}>
            End live
          </button>
        ) : (
          <>
            <button type="button" className="rk-btn rk-btn-honey" onClick={() => void (bea ? startBea() : start())} disabled={!bea && !!st.missing?.length}>
              Go live
            </button>
            {bea && !st.missing?.length ? (
              <button type="button" className="rk-btn" onClick={() => void start()}>
                SignalWire fallback
              </button>
            ) : null}
          </>
        )}
        <span className="font-mono text-xs" data-testid="go-live-state">
          {phase}
          {msg ? ` · ${msg}` : ""}
        </span>
      </div>
      <div className="mt-4 border-t pt-3" data-testid="live-chat">
        <p className="text-xs font-bold">Live chat</p>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
          {chat.map((m, i) => (
            <li key={i} data-who={m.who}>
              <b>{m.who === "you" ? "You" : "Rakaza"}:</b> {m.text}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void sendChat(e)} className="mt-2 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="Say something to Rakaza" aria-label="Live chat message" className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" />
          <button type="submit" className="rk-btn" disabled={busy || !draft.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}
