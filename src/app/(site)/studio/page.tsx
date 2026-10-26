import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import Link from "next/link";
import { StudioCreate } from "@/components/pages/studio-create";

export const metadata: Metadata = withShare({
  title: "Studio",
  description: "Design a character, make a token logo and hand it to the Launch tab. Image generation is owner-only.",
}, "/studio");

const STEPS = [
  { n: "01", title: "Describe it", body: "Write a few words about the character, picture or coin logo you want." },
  { n: "02", title: "Generate", body: "An image comes back in seconds, drawn with FLUX Schnell through Pollinations." },
  { n: "03", title: "Launch it", body: "Use the picture as the token image on the Launch tab. On a sponsored launch the 70/30 fee split (70% user, 30% Rakaza agent wallet) is permanent; on a self launch you keep 100%." },
];

const LINKS = [
  { href: "/studio/create", title: "Create", body: "The full generator page: character design, picture and token logo.", cta: "Open Create", primary: true },
  { href: "/studio/learn", title: "How it works", body: "Three short steps from idea to coin, and what is owner-only.", cta: "Read the steps", primary: false },
  { href: "/studio/explore", title: "Explore", body: "A gallery of creations. It fills in as characters are made.", cta: "Open Explore", primary: false },
  { href: "/studio/help", title: "Help", body: "What the Studio never asks for: seed phrases, private keys and DMs.", cta: "Open Help", primary: false },
];

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default function Page() {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">CHARACTER AND TOKEN STUDIO</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]" data-testid="studio-title">
            Studio
          </h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Make a face for your coin.</p>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85">
            Design a character, draw a token logo and send it to the Launch tab. Anyone can read how it works. Generating images is for the owner only, so
            nobody else can spend the platform&apos;s image quota.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href="/studio/create" className="rk-btn rk-btn-honey">
              Open the generator
            </Link>
            <Link href="/studio/learn" className="rk-btn rk-btn-white">
              How it works
            </Link>
            <span className="rk-pill !border-white/70 text-white">OWNER-ONLY GENERATION</span>
          </div>
        </div>
      </section>

      <section className="rk-container py-10 md:py-14">
        <h2 className="rk-h2 text-3xl">Where to go</h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LINKS.map((l) => (
            <li key={l.href} className="rk-card rk-card-hard flex flex-col">
              <h3 className="rk-h2 text-2xl">{l.title}</h3>
              <p className="mt-2 flex-1 text-[0.95rem] leading-snug">{l.body}</p>
              <Link href={l.href} className={`rk-btn ${l.primary ? "rk-btn-honey" : "rk-btn-white"} rk-btn-sm mt-4 self-start`}>
                {l.cta} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rk-container grid gap-6 pb-10 md:grid-cols-[1.4fr_1fr] md:pb-14">
        <div className="rk-card rk-card-hard" data-testid="studio-entry">
          <h2 className="rk-h2 text-2xl">Quick generator</h2>
          <p className="mt-2 text-[0.95rem] leading-snug">
            Try it right here, or use the <Link href="/studio/create" className="underline">full page</Link>. If you are not signed in as the owner, Generate will tell you so.
          </p>
          <StudioCreate />
        </div>
        <div className="rk-card">
          <h2 className="rk-h2 text-2xl">Three steps</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3 text-[0.95rem] leading-snug">
                <span className="rk-pill !min-h-8 shrink-0 text-xs">{s.n}</span>
                <span>
                  <strong>{s.title}.</strong> {s.body}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
