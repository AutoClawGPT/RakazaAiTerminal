"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { confirmAdult, isAdultConfirmed, setBold, useStage } from "@/lib/stage/motion-bus";

/** The age gate: nothing in the 18+ club starts until this is confirmed (once per browser session). */
function AgeGate({ onCancel, onEnter }: { onCancel: () => void; onEnter: () => void }) {
  const [ok, setOk] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4" data-testid="age-gate" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rk-age-title"
        className="w-full max-w-sm rounded-2xl border-2 border-[#ff2f8e] bg-[#12041f] p-5 text-white shadow-[0_0_34px_rgba(255,47,142,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="rk-age-title" className="font-mono text-xs font-bold tracking-widest text-[#ff7ab8]">
          18+ CLUB MODE
        </p>
        <h2 className="mt-1 text-xl font-extrabold">Lights down, slow and flirty</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          Rakaza moves to a dim neon club stage with a slow, sultry dance: hip sways, body rolls, hair flips, winks and blown kisses. It is suggestive, never explicit.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
          <input ref={box} type="checkbox" className="mt-0.5 size-4 accent-[#ff2f8e]" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="age-check" />
          <span>I confirm that I am 18 years old or older.</span>
        </label>
        <div className="mt-5 flex gap-2">
          <button type="button" className="min-h-10 flex-1 rounded-full border-2 border-white/30 px-4 text-sm font-bold text-white/80" onClick={onCancel} data-testid="age-cancel">
            Not now
          </button>
          <button
            type="button"
            disabled={!ok}
            className="min-h-10 flex-1 rounded-full border-2 border-[#ff2f8e] bg-[#ff2f8e] px-4 text-sm font-extrabold text-white shadow-[0_0_18px_rgba(255,47,142,0.7)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            onClick={onEnter}
            data-testid="age-enter"
          >
            Enter the club
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The 18+ button. First press asks for the age confirmation; after that it switches the club on and off. */
export function AdultToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { bold } = useStage();
  const [gate, setGate] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-pressed={bold}
        aria-label={bold ? "Leave the 18+ club" : "Enter the 18+ club (age confirmation)"}
        title={bold ? "Leave the 18+ club" : "18+ club mode: dim neon stage, slow sultry dance (never explicit)"}
        data-testid="adult-toggle"
        data-on={bold ? "1" : "0"}
        onClick={() => {
          if (bold) setBold(false);
          else if (isAdultConfirmed()) setBold(true);
          else setGate(true);
        }}
        className={`inline-flex items-center gap-1 rounded-full border-2 font-mono font-extrabold tracking-wide transition-shadow ${compact ? "min-h-7 px-2.5 text-[0.7rem]" : "min-h-8 px-3 text-xs"} ${bold ? "border-[#ff2f8e] bg-[#ff2f8e] text-white shadow-[0_0_16px_rgba(255,47,142,0.9)]" : "border-[#ff2f8e] bg-[#1b0630] text-[#ff7ab8] shadow-[0_0_10px_rgba(255,47,142,0.55)]"} ${className}`}
      >
        18+{bold ? " ON" : ""}
      </button>
      {gate ? (
        <AgeGate
          onCancel={() => setGate(false)}
          onEnter={() => {
            confirmAdult();
            setBold(true);
            setGate(false);
          }}
        />
      ) : null}
    </>
  );
}
