"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronDown, Globe, Maximize2, Minimize2, Phone, SendHorizontal, VolumeX, Volume2, X } from "lucide-react";
import { RakazaMark } from "@/components/brand/logo";
import { CharacterStage } from "@/components/stage/character-stage";

type Msg = { id: number; who: "her" | "me" | "sys"; text: string };
const SUGGEST = ["hi Rakaza 💜", "rate my rizz", "wen moon?", "what do you do all day?"];
const MAX = 500;

export function TalkClient() {
  const [adult, setAdult] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 1, who: "her", text: "hi, I’m Rakaza 💜 what’s up?" }]);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const stageBox = useRef<HTMLElement>(null);
  const idRef = useRef(2);

  function send(text: string) {
    const t = text.trim().slice(0, MAX);
    if (!t) return;
    setMsgs((m) => [
      ...m,
      { id: idRef.current++, who: "me", text: t },
      { id: idRef.current++, who: "sys", text: "Preview only: her brain connects in Phase 3, so this message was not sent anywhere." },
    ]);
    setDraft("");
  }
  async function toggleFull() {
    const el = stageBox.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
      setFull(!document.fullscreenElement);
    } catch {
      /* fullscreen not available */
    }
  }

  return (
    <div className="grid h-full grid-rows-[minmax(15rem,40%)_minmax(0,1fr)] lg:grid-cols-[minmax(22rem,27rem)_minmax(0,1fr)] lg:grid-rows-1">
      {/* ---------- stage (top on mobile, right on desktop) ---------- */}
      <section ref={stageBox} className="relative order-1 p-2 lg:order-2 lg:p-3" aria-label="Rakaza">
        <div className="rk-hero relative h-full rounded-[1.6rem] border-2 border-[var(--rk-line)] shadow-[0_6px_0_var(--rk-violet)]">
          <div className="rk-rays" aria-hidden="true" />
          <CharacterStage variant="bust" controls="full" wheelZoom className="h-full" />
          <div className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rk-ink)] bg-white px-3 py-1 font-mono text-[0.7rem] font-bold text-[var(--rk-ink)]">
            <span className="size-1.5 rounded-full bg-[var(--rk-pink)]" aria-hidden="true" /> preview
          </div>
          <div className="absolute right-3 top-3 z-20 flex gap-2">
            <button type="button" className="rk-icon-btn !size-9" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"}>
              {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <Link href="/" className="rk-icon-btn !size-9" aria-label="Close and go home">
              <X className="size-4" />
            </Link>
          </div>
          <button type="button" disabled className="rk-btn rk-btn-ink rk-btn-sm absolute bottom-3 right-3 z-20 hidden disabled:opacity-60 md:inline-flex" title="Voice calls arrive in Phase 3">
            <Phone className="size-4" aria-hidden="true" /> Call
          </button>
        </div>
      </section>

      {/* ---------- chat ---------- */}
      <section className="order-2 flex min-h-0 flex-col border-t-2 border-[var(--rk-line)] lg:order-1 lg:border-r-2 lg:border-t-0" aria-label="Chat with Rakaza">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-[var(--rk-line)] px-3 py-2">
          <Link href="/" className="flex items-center gap-2 font-bold" aria-label="Rakaza home">
            <RakazaMark className="size-8" />
            <span className="inline-flex items-center gap-1 text-sm">
              Rakaza <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
            </span>
          </Link>
          <button type="button" className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-muted-foreground" aria-label="Language: English">
            <Globe className="size-3.5" aria-hidden="true" /> EN <ChevronDown className="size-3" aria-hidden="true" />
          </button>
          <span className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" /> preview
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-full border-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] px-3 py-0.5 text-xs font-bold text-[var(--rk-ink)]">Stranger</span>
            <button type="button" className="rk-icon-btn !size-8" aria-pressed={muted} aria-label={muted ? "Unmute her voice" : "Mute her voice"} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            {adult ? (
              <button type="button" className="rk-pill !min-h-8 text-xs" onClick={() => setMsgs(msgs.slice(0, 1))}>
                Clear
              </button>
            ) : null}
          </span>
        </header>

        {!adult ? (
          <div className="grid flex-1 place-items-center overflow-y-auto p-6">
            <div className="max-w-sm">
              <h1 className="rk-h2 text-2xl">Before you chat</h1>
              <p className="mt-3 text-sm leading-relaxed">
                Rakaza is an AI character for adults. By chatting, you confirm you’re <strong>18 or older</strong>.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Your messages are sent to an AI service that writes her replies, and your chat history stays in this browser. Don’t share personal info, passwords, keys or seed phrases. Entertainment only, not financial advice.
              </p>
              <button type="button" className="rk-btn rk-btn-honey mt-5" onClick={() => setAdult(true)}>
                I’m 18+ · start chatting
              </button>
            </div>
          </div>
        ) : (
          <>
            <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
              {msgs.map((m) => (
                <li key={m.id} className={m.who === "me" ? "self-end" : "self-start"}>
                  {m.who === "her" ? <span className="mb-1 block font-mono text-[0.65rem] text-muted-foreground">Rakaza</span> : null}
                  <p
                    className={
                      m.who === "sys"
                        ? "max-w-[22rem] text-xs italic text-muted-foreground"
                        : m.who === "me"
                          ? "max-w-[22rem] rounded-2xl rounded-br-sm border-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] px-3 py-2 text-sm text-[var(--rk-ink)]"
                          : "max-w-[22rem] rounded-2xl rounded-bl-sm border-2 border-[var(--rk-line)] bg-card px-3 py-2 text-sm"
                    }
                  >
                    {m.text}
                  </p>
                </li>
              ))}
            </ol>
            <div className="shrink-0 border-t-2 border-[var(--rk-line)] p-3">
              <div className="mb-2 hidden flex-wrap gap-2 sm:flex">
                {SUGGEST.map((s) => (
                  <button key={s} type="button" className="rk-pill !min-h-8 text-xs" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <form
                className="flex items-end gap-2 rounded-2xl border-2 border-[var(--rk-violet)] bg-card p-1.5 focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--rk-honey)] focus-within:[outline-style:solid]"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
              >
                <label htmlFor="talk-input" className="sr-only">
                  Message Rakaza
                </label>
                <textarea
                  id="talk-input"
                  rows={1}
                  value={draft}
                  maxLength={MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  placeholder="Say something…"
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
                />
                <button type="submit" disabled={!draft.trim()} className="rk-btn rk-btn-honey rk-btn-sm disabled:opacity-50" aria-label="Send">
                  <span className="hidden sm:inline">Send</span> <SendHorizontal className="size-4 sm:hidden" aria-hidden="true" />
                </button>
              </form>
              <p className="mt-1.5 flex justify-between font-mono text-[0.65rem] text-muted-foreground">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span className="tabular-nums">
                  {draft.length}/{MAX}
                </span>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
