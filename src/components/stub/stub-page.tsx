import Link from "next/link";
import type { ReactNode } from "react";
import { ACCESS_LABEL, getRoute } from "@/lib/routes";

export function StubPage({ path, variant = "site", children }: { path: string; variant?: "site" | "dash"; children?: ReactNode }) {
  const r = getRoute(path);
  const parts = r.title.split(" · ");
  const h1 = parts[parts.length - 1];
  const kicker = parts.length > 1 ? parts[0] : r.kicker;
  const dash = variant === "dash";
  return (
    <>
      <section className={`rk-hero ${dash ? "rounded-b-[2rem]" : ""}`}>
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className={`rk-container flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between ${dash ? "py-10 md:py-12" : "py-14 md:py-20"}`}>
          <div className="min-w-0 max-w-3xl">
            <p className="rk-kicker mb-4 text-white/85">{kicker}</p>
            <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]" data-testid="stub-title">
              {h1}
            </h1>
            <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">{r.blurb.split(". ")[0].replace(/\.$/, "")}.</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="rk-pill !border-white/70 text-white">{ACCESS_LABEL[r.access]}</span>
              <span className="rk-pill !border-white/40 font-mono text-[0.72rem] text-white/80">{r.path}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rk-container grid gap-6 py-10 md:grid-cols-[1.4fr_1fr] md:py-14">
        <div className="rk-card rk-card-hard">
          <h2 className="rk-h2 text-2xl">{children ? "What you can do here" : "What this page is for"}</h2>
          <ul className="mt-4 space-y-3">
            {r.bullets.map((b) => (
              <li key={b} className="flex gap-3 text-[0.95rem] leading-snug">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--rk-mint)] ring-2 ring-[var(--rk-ink)]" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {children}
        </div>
        <div className="rk-card">
          <h2 className="rk-h2 text-2xl">Status</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="rk-kicker text-muted-foreground">State</dt>
              <dd className="mt-1 font-semibold">{children ? "Live" : "In development"}</dd>
            </div>
            <div>
              <dt className="rk-kicker text-muted-foreground">Access</dt>
              <dd className="mt-1 font-semibold">{ACCESS_LABEL[r.access]}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={dash ? "/dash" : "/"} className="rk-btn rk-btn-honey rk-btn-sm">
              {dash ? "Back to dashboard" : "Back home"}
            </Link>
            {!dash ? (
              <Link href="/roadmap" className="rk-btn rk-btn-white rk-btn-sm">
                Roadmap
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
