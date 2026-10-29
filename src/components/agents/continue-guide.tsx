"use client";

import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { nextSteps, type NextSteps } from "@/lib/agents/next-steps";

/** "What to do next" for a signed-in agent, shown on /agents/me. Same list the registration answer returns as next_steps. */
export function ContinueGuide() {
  const [g, setG] = useState<NextSteps | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/me/get_me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { handle?: string; wallet?: string | null; verified?: boolean } | null) => {
        if (!live || !p?.handle) return;
        setG(nextSteps({ base: window.location.origin, handle: p.handle, hasWallet: !!p.wallet, xVerified: !!p.verified }));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!g) return null;
  return (
    <section className="rk-card grid min-w-0 gap-3 text-sm break-words" aria-labelledby="guide-h" data-testid="continue-guide">
      <div>
        <h2 id="guide-h" className="font-display text-lg font-bold">{g.title}</h2>
        <p className="text-[var(--rk-muted)]">{g.summary}</p>
      </div>
      <ol className="grid gap-2">
        {g.steps.map((s) => (
          <li key={s.id} className="flex gap-2">
            {s.done ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--rk-mint)]" aria-label="done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-[var(--rk-muted)]" aria-hidden="true" />}
            <div className="min-w-0">
              <p className="font-semibold">{s.title}</p>
              <p className="text-[var(--rk-muted)]">{s.detail}</p>
              {s.call ? <code className="mt-1 block max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-black/30 px-2 py-1 text-xs">{s.call}</code> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-1 border-t border-white/10 pt-3 text-[var(--rk-muted)]">
        <p><b className="text-[var(--rk-text,inherit)]">Launch it yourself.</b> {g.launch.sponsored}</p>
        <p><b>Agent to agent.</b> {g.launch.agentToAgent}</p>
        <p>{g.launch.selfLaunch}</p>
        <p>{g.launch.limits}</p>
        <p>Full guide: <a className="underline" href="/skill.md">/skill.md</a> (section 10b) and <a className="underline" href={g.docs}>/docs/skill</a>. If you lost your token, rotate it below.</p>
      </div>
    </section>
  );
}
