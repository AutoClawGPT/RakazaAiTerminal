"use client";
/**
 * /live only: when BEA (owner's EC2) is configured and reachable, every visitor sees her own BEA stage (the avatar set up in the
 * BEA dashboard) instead of our VRM desk, hears her /listen voice, gets her captions/state, and the public chat goes to BEA.
 * If BEA is down, nothing changes: the offline VRM view stays.
 */
import { useEffect, useState, type ReactNode } from "react";
import { pushChat, setBrain, setLive, useBrain, useLive } from "@/lib/live/live-state";

const BEA_WATCH = "https://live.13-62-148-110.sslip.io/";

export function BeaStageSwitch({ children }: { children: ReactNode }) {
  const { live } = useLive();
  const bea = useBrain() === "bea" && live;
  const [hint, setHint] = useState(true);

  useEffect(() => {
    let dead = false;
    let on = false;
    let t: ReturnType<typeof setInterval> | null = null;
    const check = () =>
      fetch("/api/live/bea/status", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { bea?: boolean }) => {
          if (dead) return;
          if (j.bea && !on) { on = true; setBrain("bea"); setLive(true); }
          else if (!j.bea && on) { on = false; setLive(false); setBrain("sw"); }
        })
        .catch(() => {});
    void check();
    t = setInterval(check, 60000);
    return () => { dead = true; if (t) clearInterval(t); };
  }, []);

  return (
    <>
      <div style={{ display: bea ? "none" : "contents" }}>{children}</div>
      {bea ? (
        <iframe
          src={BEA_WATCH}
          title="Oni-Chan live (BEA real stream)"
          data-testid="bea-stage"
          className="absolute inset-0 z-[1] h-full w-full border-0 bg-black"
          allow="autoplay; fullscreen"
          onPointerDown={() => setHint(false)}
        />
      ) : null}
      {bea && hint ? (
        <button type="button" onClick={() => setHint(false)} data-testid="bea-unmute" className="rk-btn rk-btn-honey absolute left-1/2 top-3 z-30 -translate-x-1/2 !min-h-8 text-xs">
          🔊 Tap the speaker on the player to hear her
        </button>
      ) : null}
    </>
  );
}

/** Public live chat to BEA, shown only while BEA is on air (rate limits are server-side). */
export function BeaPublicChat() {
  const { live, chat } = useLive();
  const on = useBrain() === "bea" && live;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  if (!on) return null;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 300);
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    pushChat({ who: "you", text });
    try {
      const r = await fetch("/api/live/bea/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      const j = (await r.json().catch(() => ({}))) as { reply?: string; error?: string; message?: string; queued?: boolean };
      const reply = (j.reply ?? "").replace(/<[^>]*>/g, "").trim() || (r.status === 429 ? j.message || "Too many messages, give me a second." : j.error ? "(she can't answer right now)" : j.queued ? "(got it, she'll answer out loud on stream)" : "(she answered out loud on stream)");
      pushChat({ who: "rakaza", text: reply });
    } catch {
      pushChat({ who: "rakaza", text: "(she can't answer right now)" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rk-card rk-card-hard" aria-labelledby="live-chat-public" data-testid="live-chat">
      <h2 id="live-chat-public" className="rk-h2 text-xl">Live chat</h2>
      <p className="mt-1 text-xs text-muted-foreground">She’s an AI · 18+ · PG-13 · not financial advice. No links or personal info.</p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
        {chat.map((m, i) => (
          <li key={i} data-who={m.who}><b>{m.who === "you" ? "You" : "Rakaza"}:</b> {m.text}</li>
        ))}
      </ul>
      <form onSubmit={(e) => void send(e)} className="mt-2 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="Say something to Rakaza" aria-label="Live chat message" className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rk-btn" disabled={busy || !draft.trim()}>{busy ? "…" : "Send"}</button>
      </form>
    </section>
  );
}
