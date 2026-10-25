"use client";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/** Slide-open panel: smooth height animation, keyboard accessible, respects reduced motion. */
export function SlidePanel({ title, hint, defaultOpen = false, children }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="rk-card">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="rk-h2 block text-xl">{title}</span>
          {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <ChevronDown className={`size-5 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={id} role="region" aria-label={title} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden" inert={!open}>
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ToolHero({ kicker, title, blurb }: { kicker: string; title: string; blurb: string }) {
  // Long single words (e.g. "Dashboard") in the wide display face would break mid-word at 390px, so they get a smaller size.
  const longWord = title.split(/\s+/).some((w) => w.length >= 9);
  const size = longWord ? "text-[clamp(1.8rem,7.4vw,5rem)]" : "text-[clamp(2.4rem,9vw,5rem)]";
  return (
    <section className="rk-hero rounded-b-[2rem]">
      <div className="rk-rays" aria-hidden="true" />
      <div className="rk-dots" aria-hidden="true" />
      <div className="rk-container py-10 md:py-12">
        <p className="rk-kicker mb-3 text-white/85">{kicker}</p>
        <h1 className={`rk-display ${size}`}>{title}</h1>
        <p className="rk-serif mt-4 max-w-2xl text-[clamp(1.2rem,3vw,1.8rem)] text-white">{blurb}</p>
      </div>
    </section>
  );
}

export const fieldCls =
  "min-h-11 w-full rounded-xl border-2 border-[var(--rk-line)] bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-[var(--rk-honey)]";
export const labelCls = "rk-kicker mb-1 block text-muted-foreground";
