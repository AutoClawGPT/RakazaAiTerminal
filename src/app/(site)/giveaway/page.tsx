import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Giveaway" };

export default function Page() {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">GIVEAWAY · COMING SOON</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">Giveaway</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Giveaways are planned, not built.</p>
        </div>
      </section>
      <section className="rk-container py-10 md:py-14">
        <div className="rk-card rk-card-hard max-w-2xl">
          <h2 className="rk-h2 text-2xl">Coming soon</h2>
          <p className="mt-3 text-[0.95rem] leading-snug">There is no giveaway running. When one opens, the rules, the dates and how winners are chosen will be posted here before anything starts.</p>
          <p className="mt-3 text-xs text-muted-foreground">Not financial advice. Never a promise about price. 18+, only where it is legal.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/roadmap" className="rk-btn rk-btn-honey rk-btn-sm">See the roadmap</Link>
            <Link href="/" className="rk-btn rk-btn-white rk-btn-sm">Back home</Link>
          </div>
        </div>
      </section>
    </>
  );
}
