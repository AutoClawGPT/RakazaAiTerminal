import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Roadmap", description: "What Rakaza can do today and what is coming next." };

type Status = "UNDER WAY" | "COMING SOON";
const ITEMS: { n: string; status: Status; title: string; body: string; tags: string; href?: string; cta?: string }[] = [
  {
    n: "01",
    status: "UNDER WAY",
    title: "Talk to Rakaza",
    body: "Chat with her, call her and hear her voice. Commands like /sing, /joke and /check let her do more than reply.",
    tags: "chat · voice · calls · commands",
    href: "/talk",
    cta: "Open Talk",
  },
  {
    n: "02",
    status: "COMING SOON",
    title: "Coin checker",
    body: "Paste any Solana coin address and get a plain-language risk read built from on-chain data, not from hype.",
    tags: "pump.fun · Jupiter · DexScreener · on-chain",
    href: "/",
    cta: "See the checker",
  },
  {
    n: "03",
    status: "COMING SOON",
    title: "Launch with Rakaza",
    body: "Create a coin on pump.fun from your own wallet or sponsored by the treasury, with a permanent 70/30 creator fee split.",
    tags: "own wallet · sponsored · fee split · vanity address",
  },
  {
    n: "04",
    status: "COMING SOON",
    title: "Her live show",
    body: "A live stage where Rakaza reacts to the queue, the market and the room.",
    tags: "live · queue · host panel",
    href: "/live",
    cta: "Open Live",
  },
  {
    n: "05",
    status: "COMING SOON",
    title: "Connect your agent",
    body: "Anyone can register and connect their own agent to Rakaza through skill.md, with their own key and limits.",
    tags: "skill.md · MCP · API keys",
    href: "/agents",
    cta: "Agents",
  },
  {
    n: "06",
    status: "COMING SOON",
    title: "Games",
    body: "Three free browser games with original art. No wallet needed to play.",
    tags: "runner · trading sim · beat-em-up",
    href: "/games",
    cta: "Games",
  },
  {
    n: "07",
    status: "COMING SOON",
    title: "Studio",
    body: "Make your own AI character: photos, voice and a coin with its face.",
    tags: "photos · voice · 3D · coins",
    href: "/studio",
    cta: "Studio",
  },
  {
    n: "08",
    status: "COMING SOON",
    title: "Diary and memes",
    body: "Rakaza writes what she saw each day, and the community shares memes.",
    tags: "diary · memes",
    href: "/diary",
    cta: "Diary",
  },
];

export default function Page() {
  const under = ITEMS.filter((i) => i.status === "UNDER WAY").length;
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">ROADMAP · OCTOBER 2026</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">The Rakaza roadmap</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">What is being built, and what comes next.</p>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85">
            Rakaza is being built in the open, one step at a time. Nothing below is live until it says live. This list is not in order: any of it could land first.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rk-pill !border-white/70 text-white">0 of {ITEMS.length} live</span>
            <span className="rk-pill !border-white/70 text-white">
              {under} under way · {ITEMS.length - under} coming soon
            </span>
          </div>
        </div>
      </section>
      <section className="rk-container py-10 md:py-14">
        <ol className="grid gap-5 md:grid-cols-2">
          {ITEMS.map((i) => (
            <li key={i.n} className="rk-card rk-card-hard flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <span className="rk-kicker text-muted-foreground">{i.n}</span>
                <span className="rk-pill text-xs">{i.status}</span>
              </div>
              <h2 className="rk-h2 mt-3 text-2xl">{i.title}</h2>
              <p className="mt-2 text-[0.95rem] leading-snug">{i.body}</p>
              <p className="mt-3 font-mono text-[0.72rem] text-muted-foreground">{i.tags}</p>
              {i.href ? (
                <Link href={i.href} className="rk-btn rk-btn-honey rk-btn-sm mt-4 self-start">
                  {i.cta} →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs text-muted-foreground">Entertainment only, not financial advice. Never a promise about price. 18+, only where it is legal.</p>
      </section>
    </>
  );
}
