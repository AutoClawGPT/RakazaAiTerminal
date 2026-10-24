"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachElement, stopAudio } from "@/lib/stage/audio-bus";

/**
 * Voice for Talk: her spoken replies (Deepgram Aura-2 via our /api/voice/tts, routed through the
 * lip-sync analyser) and the listening side (Deepgram nova-3 live, using a 60 second token minted by
 * our server so the real key never reaches the browser).
 */
export function useVoice(opts: { onFinalText: (text: string) => void; muted: boolean }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalRef = useRef(opts.onFinalText);
  const speakingRef = useRef(false);
  useEffect(() => {
    finalRef.current = opts.onFinalText;
  }, [opts.onFinalText]);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    stopAudio();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (opts.muted) return;
      try {
        stopSpeaking();
        const res = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
        if (!res.ok) throw new Error("voice unavailable");
        const url = URL.createObjectURL(await res.blob());
        const el = new Audio(url);
        audioRef.current = el;
        attachElement(el);
        speakingRef.current = true;
        setSpeaking(true);
        el.onended = () => {
          URL.revokeObjectURL(url);
          stopSpeaking();
        };
        await el.play();
      } catch (e) {
        stopSpeaking();
        setError(e instanceof Error ? e.message : "voice failed");
      }
    },
    [opts.muted, stopSpeaking],
  );

  const stopListening = useCallback(() => {
    try {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
    wsRef.current?.close();
    wsRef.current = null;
    recRef.current = null;
    streamRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      const tk = await fetch("/api/voice/token", { method: "POST" });
      if (!tk.ok) throw new Error("voice is not set up on the server");
      const { token } = (await tk.json()) as { token: string };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const ws = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&endpointing=800&utterance_end_ms=1500", ["bearer", token]);
      wsRef.current = ws;
      let buffer = "";
      ws.onopen = () => {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recRef.current = rec;
        rec.ondataavailable = (ev) => ev.data.size && ws.readyState === WebSocket.OPEN && ws.send(ev.data);
        rec.start(250);
        setListening(true);
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string) as { type?: string; is_final?: boolean; speech_final?: boolean; channel?: { alternatives?: { transcript: string }[] } };
        if (m.type !== "Results") return;
        const t = m.channel?.alternatives?.[0]?.transcript ?? "";
        if (!t) return;
        if (speakingRef.current) stopSpeaking(); // barge-in: she stops when you talk
        if (m.is_final) buffer += (buffer ? " " : "") + t;
        setInterim(m.is_final ? "" : t);
        if (m.speech_final && buffer.trim()) {
          finalRef.current(buffer.trim());
          buffer = "";
          setInterim("");
        }
      };
      ws.onerror = () => setError("mic connection failed");
      ws.onclose = () => stopListening();
    } catch (e) {
      stopListening();
      setError(e instanceof Error ? e.message : "could not start the mic");
    }
  }, [stopListening, stopSpeaking]);

  useEffect(() => () => {
    stopListening();
    stopSpeaking();
  }, [stopListening, stopSpeaking]);

  return { listening, speaking, interim, error, speak, stopSpeaking, startListening, stopListening };
}
