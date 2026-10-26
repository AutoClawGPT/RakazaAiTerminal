import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ kicker, title, intro, updated, sections }: { kicker: string; title: string; intro: string; updated: string; sections: { h: string; body: ReactNode }[] }) {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">{kicker}</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]" data-testid="stub-title">
            {title}
          </h1>
          <p className="rk-serif mt-5 max-w-2xl text-[clamp(1.2rem,3vw,1.8rem)] text-white">{intro}</p>
          <p className="mt-4 font-mono text-xs text-white/80">Last updated {updated}</p>
        </div>
      </section>
      <section className="rk-container grid max-w-3xl gap-5 py-10 md:py-14">
        {sections.map((s) => (
          <article key={s.h} className="rk-card rk-card-hard">
            <h2 className="rk-h2 text-xl">{s.h}</h2>
            <div className="mt-3 grid gap-3 text-[0.95rem] leading-relaxed">{s.body}</div>
          </article>
        ))}
        <div className="flex flex-wrap gap-2">
          <Link href="/terms" className="rk-btn rk-btn-white rk-btn-sm">Terms</Link>
          <Link href="/privacy" className="rk-btn rk-btn-white rk-btn-sm">Privacy</Link>
          <Link href="/" className="rk-btn rk-btn-honey rk-btn-sm">Back home</Link>
        </div>
      </section>
    </>
  );
}
