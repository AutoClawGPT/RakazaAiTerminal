"use client";
import { useMemo, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { attackerTimes, compareAddresses, humanTime, shieldScore } from "@/lib/tools/shield";
import { isSolanaAddress } from "@/lib/tools/address";

const sevCls = { bad: "border-[var(--rk-pink)]", warn: "border-[var(--rk-honey)]", ok: "border-[var(--rk-mint)]" } as const;

export function ShieldTool() {
  const [real, setReal] = useState("");
  const [n, setN] = useState(4);
  const [fake, setFake] = useState("");
  const s = useMemo(() => shieldScore(n), [n]);
  const times = useMemo(() => attackerTimes(n), [n]);
  const cmp = useMemo(() => (real && fake ? compareAddresses(real, fake) : null), [real, fake]);
  const realOk = real === "" || isSolanaAddress(real);
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid gap-5">
      <SlidePanel title="Clone cost" hint="How many keys a copycat must try" defaultOpen>
        <label className={labelCls} htmlFor="sh-real">Your contract address (optional)</label>
        <input id="sh-real" className={`${fieldCls} font-mono`} value={real} onChange={(e) => setReal(e.target.value.trim())} placeholder="Paste a Solana address" spellCheck={false} aria-invalid={!realOk} />
        {!realOk ? <p className="mt-1 text-xs text-[var(--rk-pink)]">That is not a valid Solana address.</p> : null}
        <label className={`${labelCls} mt-4`} htmlFor="sh-seen">Characters people compare at each end: {n}</label>
        <input id="sh-seen" type="range" min={2} max={8} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full accent-[var(--rk-honey)]" />
        <div className="mt-4 grid items-center gap-5 sm:grid-cols-[9rem_1fr]">
          <div className="relative mx-auto size-36" role="img" aria-label={`Shield score ${s.score} out of 100, ${s.grade}`}>
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--rk-honey)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - s.score / 100)} className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none" />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display text-3xl font-black" data-testid="shield-score">{s.score}</div>
                <div className="text-xs font-semibold" data-testid="shield-grade">{s.grade}</div>
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm">
              About <strong data-testid="shield-keys">{s.keys.toExponential(2)}</strong> keys to match {n} characters at both ends. Every extra character costs 58 times more.
            </p>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Time to clone by attacker hardware</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1">Attacker</th>
                  <th scope="col">Speed</th>
                  <th scope="col" className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t.name} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-semibold">{t.name}</th>
                    <td className="font-mono text-xs">{t.rate.toLocaleString("en-US")}/s</td>
                    <td className="text-right font-mono text-xs">{humanTime(t.seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SlidePanel>

      <SlidePanel title="Compare a suspect" hint="Is this address a lookalike of yours?">
        <label className={labelCls} htmlFor="sh-fake">Suspect address</label>
        <input id="sh-fake" className={`${fieldCls} font-mono`} value={fake} onChange={(e) => setFake(e.target.value.trim())} placeholder="Paste the address to check" spellCheck={false} />
        <div role="status" aria-live="polite" className="mt-3" data-testid="shield-verdict">
          {!real || !fake ? (
            <p className="text-sm text-muted-foreground">Fill in your address above and the suspect here.</p>
          ) : cmp && !cmp.valid ? (
            <p className="rounded-xl border-2 border-[var(--rk-pink)] p-3 text-sm">{cmp.error}</p>
          ) : cmp ? (
            <div className={`rounded-xl border-2 p-3 text-sm ${sevCls[cmp.severity ?? "ok"]}`}>
              <strong>{cmp.message}</strong>
              {cmp.verdict !== "same" ? (
                <p className="mt-1">
                  Matching start: {cmp.head}, matching end: {cmp.tail}. Copying that much would take about {cmp.cost.toExponential(1)} keys.
                  {cmp.confusables.length ? ` Look-alike characters spotted: ${cmp.confusables.map((c) => `${c.a}/${c.b}`).join(", ")}.` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SlidePanel>
    </div>
  );
}
