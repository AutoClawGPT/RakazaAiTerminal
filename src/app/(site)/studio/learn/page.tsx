import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import Link from "next/link";

export const metadata: Metadata = withShare({ title: "Studio \u00b7 How it works", description: "From idea to coin in three steps, and what is owner-only." }, "/studio/learn");

const STEPS = [
  { n: "01", title: "Describe what you want", body: "In the Create page pick Character design, Picture or Token logo and write a short description. Keep it under 600 characters. Original characters only: do not ask for a real person or someone else's artwork." },
  { n: "02", title: "Generate the image", body: "The server calls Pollinations (FLUX Schnell) with the platform key. The key never reaches your browser. A 512 px image takes about 5 seconds, 1024 px a little longer. One image at a time." },
  { n: "03", title: "Use it on a coin", body: "Download the picture and use it as the token image on the Launch tab. Sponsored launches use a permanent 70/30 creator-fee split (70% user, 30% Rakaza agent wallet) and need an owner approval ticket. Self launch has no split: you keep 100%." },
];

const RULES = [
  "Generating images is owner-only. Everyone else can read this page and look around.",
  "The Studio never asks for a seed phrase, a private key or a direct message.",
  "Nothing here moves money. Launching is a separate step on the Launch tab.",
];

export default function Page() {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">STUDIO</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]" data-testid="stub-title">
            How it works
          </h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Idea to coin in three steps.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/studio/create" className="rk-btn rk-btn-honey">Open the generator</Link>
            <Link href="/studio" className="rk-btn rk-btn-white">Back to Studio</Link>
          </div>
        </div>
      </section>
      <section className="rk-container grid gap-6 py-10 md:grid-cols-[1.4fr_1fr] md:py-14">
        <ol className="space-y-5">
          {STEPS.map((s) => (
            <li key={s.n} className="rk-card rk-card-hard">
              <span className="rk-pill text-xs">STEP {s.n}</span>
              <h2 className="rk-h2 mt-3 text-2xl">{s.title}</h2>
              <p className="mt-2 text-[0.95rem] leading-snug">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="rk-card self-start">
          <h2 className="rk-h2 text-2xl">Ground rules</h2>
          <ul className="mt-4 space-y-3">
            {RULES.map((r) => (
              <li key={r} className="flex gap-3 text-[0.95rem] leading-snug">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--rk-mint)] ring-2 ring-[var(--rk-ink)]" aria-hidden="true" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
