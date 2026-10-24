import Link from "next/link";
import type { ReactNode } from "react";
import { ACCESS_LABEL, getRoute, phaseName } from "@/lib/routes";

function Stamp({ phase, label }: { phase: number; label: string }) {
  const text = `PHASE ${phase} · ${label.toUpperCase()} · `.repeat(2);
  return (
    <div className="relative mx-auto size-40 shrink-0 sm:size-48" aria-hidden="true">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full animate-[spin_40s_linear_infinite]">
        <defs>
          <path id="rk-circ" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" />
        </defs>
        <text fill="currentColor" fontFamily="var(--font-mono)" fontSize="12.5" letterSpacing="2.4">
          <textPath href="#rk-circ">{text.slice(0, 74)}</textPath>
        </text>
      </svg>
      <div className="absolute inset-[22%] grid place-items-center rounded-full border-[3px] border-[var(--rk-ink)] bg-[var(--rk-honey)] text-[var(--rk-ink)] shadow-[0_6px_0_var(--rk-pink)]">
        <span className="font-display text-5xl font-black" style={{ fontVariationSettings: '"wdth" 140' }}>
          {phase}
        </span>
      </div>
    </div>
  );
}

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
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85">
              This is a clean placeholder. The real page is built in <strong>Phase {r.phase}</strong> ({phaseName(r.phase)}). Nothing on it is live yet.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="rk-pill !border-white/70 text-white" data-testid="phase-badge">
                Phase {r.phase}
              </span>
              <span className="rk-pill !border-white/70 text-white">{ACCESS_LABEL[r.access]}</span>
              <span className="rk-pill !border-white/40 font-mono text-[0.72rem] text-white/80">{r.path}</span>
            </div>
          </div>
          <div className="text-white">
            <Stamp phase={r.phase} label={phaseName(r.phase)} />
          </div>
        </div>
      </section>

      <section className="rk-container grid gap-6 py-10 md:grid-cols-[1.4fr_1fr] md:py-14">
        <div className="rk-card rk-card-hard">
          <h2 className="rk-h2 text-2xl">What lands here</h2>
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
              <dd className="mt-1 font-semibold">Placeholder, not built yet</dd>
            </div>
            <div>
              <dt className="rk-kicker text-muted-foreground">Filled in</dt>
              <dd className="mt-1 font-semibold">
                Phase {r.phase}: {phaseName(r.phase)}
              </dd>
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
