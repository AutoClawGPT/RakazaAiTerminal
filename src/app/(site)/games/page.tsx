import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Games", description: "Free browser games with Rakaza. No wallet needed." };

const GAMES = [
  {
    href: "/games/ride-em",
    tag: "ENDLESS RUNNER",
    title: "Ride 'Em, Rakaza!",
    body: "Rakaza races across sunset rooftops and neon nights. Jump, duck, and see how far you get.",
  },
  {
    href: "/games/trench-sim",
    tag: "PLAY MONEY",
    title: "Trench Simulator",
    body: "Trade made-up coins with play money. Beat the clock in timed rounds or take your time in free play. Nothing in it is real money or advice.",
  },
  {
    href: "/games/neon-runner",
    tag: "ARCADE ACTION",
    title: "Neon Runner",
    body: "A colorful arcade run through a rain-soaked neon city.",
  },
];

export default function Page() {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">RAKAZA GAMES · IN DEVELOPMENT</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">Games</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Free games, right in your browser.</p>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85">
            No wallet needed to play and no prizes. The games are being built and are not playable yet.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rk-pill !border-white/70 text-white">FREE TO PLAY</span>
            <span className="rk-pill !border-white/70 text-white">NO WALLET NEEDED</span>
            <span className="rk-pill !border-white/70 text-white">NOT PLAYABLE YET</span>
          </div>
        </div>
      </section>
      <section className="rk-container py-10 md:py-14">
        <h2 className="rk-h2 text-3xl">The games</h2>
        <p className="mt-2 text-[0.95rem]">Three games are in development. None is playable yet; when one opens it will run here, on a computer or a phone.</p>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {GAMES.map((g) => (
            <li key={g.href} className="rk-card rk-card-hard flex flex-col">
              <div className="flex flex-wrap gap-2">
                <span className="rk-pill text-xs">COMING SOON</span>
                <span className="rk-pill text-xs">{g.tag}</span>
              </div>
              <h3 className="rk-h2 mt-3 text-2xl">{g.title}</h3>
              <p className="mt-2 flex-1 text-[0.95rem] leading-snug">{g.body}</p>
              <Link href={g.href} className="rk-btn rk-btn-honey rk-btn-sm mt-4 self-start">
                Details →
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-muted-foreground">Play money only. Not financial advice. Runs are counted, never who played.</p>
      </section>
    </>
  );
}
