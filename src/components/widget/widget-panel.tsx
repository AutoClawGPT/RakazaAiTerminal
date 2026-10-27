"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, ExternalLink, Mic, MicOff, Minus, SendHorizontal, Square, Volume2, VolumeX } from "lucide-react";
import { CharacterStage } from "@/components/stage/character-stage";
import { CssAvatar } from "@/components/stage/css-avatar";
import { fieldCls } from "@/components/tools/tool-frame";
import { useVoice } from "@/components/talk/use-voice";
import { playMotion, setSoundOn, useMotion } from "@/lib/stage/motion-bus";
import { pickSong } from "@/lib/stage/songs";

type Msg = { id: number; who: "me" | "her" | "sys"; text: string };
const MAX = 500;

export function WidgetPanel({ open, onMinimize }: { open: boolean; onMinimize: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 1, who: "her", text: "Hi, I’m Rakaza. Ask me anything about the launchpad, or just chat." }]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  // 3D VRM by default on every device (same model + renderer as /talk). 2D only if the user picks it or WebGL / the VRM load really fails.
  const [use3d, setUse3d] = useState(true);
  const [stage, setStage] = useState<"loading" | "ready" | "fallback">("loading");
  const idRef = useRef(2);
  const busy = useRef(false);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const logRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);

  const send = useCallback(async (text: string) => {
    const t = text.trim().slice(0, MAX);
    if (!t || busy.current) return;
    busy.current = true;
    const mine: Msg = { id: idRef.current++, who: "me", text: t };
    const history = [...msgsRef.current, mine].filter((m) => m.who !== "sys").map((m) => ({ role: m.who === "me" ? "user" : "assistant", content: m.text }));
    setMsgs((m) => [...m, mine]);
    setDraft("");
    setThinking(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history }) });
      const data = (await res.json()) as { reply?: string; message?: string; command?: string | null };
      if (!res.ok || !data.reply) throw new Error(data.message ?? "She didn’t answer. Try again.");
      const reply = data.reply;
      if (data.command === "sing") playMotion("sing", 20000);
      else if (data.command === "dance") playMotion("dance", 16000);
      setMsgs((m) => [...m, { id: idRef.current++, who: "her", text: reply }]);
      void voiceRef.current?.speak(reply); // only ever after the visitor sent a message, so the browser allows the sound
    } catch (e) {
      setMsgs((m) => [...m, { id: idRef.current++, who: "sys", text: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      busy.current = false;
      setThinking(false);
    }
  }, []);
  const voice = useVoice({ onFinalText: (t) => void send(t), muted });
  voiceRef.current = voice;

  const { stopSpeaking, stopListening } = voice;
  const motion = useMotion();
  useEffect(() => {
    setSoundOn(!muted);
  }, [muted]);
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      stopListening();
      playMotion("idle");
    }
  }, [open, stopSpeaking, stopListening]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, thinking]);

  return (
    <section className={`rk-widget-panel ${open ? "" : "hidden"}`} role="dialog" aria-label="Chat with Rakaza" data-testid="widget-panel" aria-hidden={!open}>
      <header className="flex items-center justify-between gap-2 border-b-2 border-[var(--rk-line)] px-3 py-2">
        <p className="rk-kicker !m-0">Rakaza · {voice.listening ? "listening" : voice.speaking ? "talking" : "online"}</p>
        <div className="flex gap-1.5">
          <button type="button" className="rk-icon-btn !size-8" aria-pressed={use3d} aria-label={use3d ? "Switch to the 2D avatar" : "Switch to the 3D avatar"} title={use3d ? "2D avatar" : "3D avatar"} onClick={() => setUse3d((v) => !v)} data-testid="widget-3d">
            <Box className="size-4" />
          </button>
          <button type="button" className="rk-icon-btn !size-8" aria-pressed={muted} aria-label={muted ? "Turn her voice on" : "Mute her voice"} onClick={() => { if (!muted) stopSpeaking(); setMuted((m) => !m); }} data-testid="widget-mute">
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <Link href="/talk" className="rk-icon-btn !size-8" aria-label="Open the full Talk page" title="Open the full Talk page" data-testid="widget-expand">
            <ExternalLink className="size-4" />
          </Link>
          <button type="button" className="rk-icon-btn !size-8" aria-label="Minimize" onClick={onMinimize} data-testid="widget-min">
            <Minus className="size-4" />
          </button>
        </div>
      </header>

      <div className="rk-hero relative h-40 shrink-0 md:h-48" data-testid="widget-stage" data-avatar={use3d && stage !== "fallback" ? "3d" : "2d"} data-stage={use3d ? stage : "off"} data-speaking={voice.speaking ? "1" : "0"}>
        {use3d ? (
          <CharacterStage variant="bust" controls="none" className="h-full" lite onState={setStage} />
        ) : (
          <div className="absolute inset-0 grid place-items-end px-6 pt-4">
            <CssAvatar className="max-h-full" />
          </div>
        )}
        {use3d && stage === "ready" ? (
          <div className="absolute bottom-1.5 left-1.5 z-10 flex gap-1.5" role="group" aria-label="Rakaza moves">
            <button type="button" className="rk-pill !min-h-7 !px-2 text-[0.7rem]" aria-pressed={motion.motion === "sing"} data-testid="widget-sing" onClick={() => { if (motion.motion === "sing") { playMotion("idle"); stopSpeaking(); } else { playMotion("sing", 24000); void voiceRef.current?.speak(pickSong()); } }}>
              Sing
            </button>
            <button type="button" className="rk-pill !min-h-7 !px-2 text-[0.7rem]" aria-pressed={motion.motion === "dance"} data-testid="widget-dance" onClick={() => playMotion(motion.motion === "dance" ? "idle" : "dance", 16000)}>
              Dance
            </button>
          </div>
        ) : null}
      </div>

      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" role="log" aria-live="polite" data-testid="widget-log">
        {msgs.map((m) => (
          <p key={m.id} className={`mb-2 max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.who === "me" ? "ml-auto bg-[var(--rk-honey)] text-[var(--rk-ink)]" : m.who === "sys" ? "border border-red-400 text-red-400" : "bg-white/10"}`}>{m.text}</p>
        ))}
        {thinking ? <p className="mb-2 animate-pulse text-xs opacity-70">Rakaza is thinking…</p> : null}
        {voice.error ? <p className="text-xs opacity-70">Voice: {voice.error}</p> : null}
        {voice.interim ? <p className="text-xs italic opacity-70">{voice.interim}</p> : null}
      </div>

      <form className="flex items-center gap-2 border-t-2 border-[var(--rk-line)] p-2" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <input className={`${fieldCls} min-w-0 flex-1`} value={draft} maxLength={MAX} onChange={(e) => setDraft(e.target.value)} placeholder="Say something…" aria-label="Message Rakaza" data-testid="widget-input" />
        <button type="button" className="rk-icon-btn !size-10" aria-pressed={voice.listening} aria-label={voice.listening ? "Stop the microphone" : "Talk with the microphone"} onClick={() => (voice.listening ? voice.stopListening() : void voice.startListening())} data-testid="widget-mic">
          {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
        {voice.speaking ? (
          <button type="button" className="rk-icon-btn !size-10" aria-label="Stop talking" onClick={voice.stopSpeaking}><Square className="size-4" /></button>
        ) : null}
        <button type="submit" className="rk-btn rk-btn-honey !min-h-10 !px-3" disabled={!draft.trim() || thinking} aria-label="Send" data-testid="widget-send">
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </section>
  );
}
