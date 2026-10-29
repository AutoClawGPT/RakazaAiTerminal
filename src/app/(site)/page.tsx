import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Copy } from "lucide-react";
import { CharacterStage } from "@/components/stage/character-stage";
import { publicEnv } from "@/lib/public-env";

const WORLD: { href: string; label: string; note: string; color: string; icon: "down" | "right" }[] = [
  { href: "/talk", label: "Talk to Rakaza", note: "the playground", color: "var(--rk-pink)", icon: "down" },
  { href: "/studio", label: "Rakaza Studio", note: "your own character", color: "var(--rk-violet)", icon: "right" },
  { href: "/games", label: "Games", note: "play Ride 'Em now", color: "var(--rk-mint)", icon: "right" },
  { href: "/memes", label: "Memes", note: "image, video and slopcore memes", color: "var(--rk-lav)", icon: "right" },
  { href: "/#checker", label: "Risk check your coins on pump.fun", note: "the checker", color: "var(--rk-mint)", icon: "down" },
  { href: "/diary", label: "Her diary", note: "one entry a day", color: "var(--rk-lav)", icon: "right" },
  { href: "/#model-card", label: "The model card", note: "how she works", color: "var(--rk-honey)", icon: "down" },
  { href: "/roadmap", label: "Roadmap", note: "what’s next", color: "var(--rk-pink)", icon: "right" },
  { href: "/live", label: "Live show", note: "ask a question", color: "var(--rk-blue)", icon: "right" },
];

const SECTIONS: { id: string; title: string; blurb: string; status: string; href: string; cta: string }[] = [
  { id: "checker", title: "Risk check your coins on pump.fun", blurb: "Holders, bundlers and a plain verdict for a mint. Today the full scan runs in the owner tools; every launched token also has a public page with chart and curve progress in Explore.", status: "In the owner tools · public page per token", href: "/explore", cta: "Open Explore" },
  { id: "manifesto", title: "Manifesto", blurb: "Be useful, be honest, and never touch anyone’s keys. Launches are devnet-only until the owner switches them, and her tools can preview but not spend.", status: "Live", href: "/docs/overview", cta: "Read the overview" },
  { id: "safety", title: "Safety note", blurb: "No seed phrases, no DMs asking for keys, no promises of returns. API keys are stored hashed. Entertainment only, not financial advice.", status: "Live", href: "/privacy", cta: "Privacy" },
  { id: "contract", title: "Contract", blurb: "The Rakaza token address, with copy and explorer links, is announced at the mainnet launch. Until then beware of any address claimed to be hers.", status: "Announced at mainnet launch", href: "/roadmap", cta: "Roadmap" },
];


function short(s: string) {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s;
}

export default function HomePage() {
  const mint = publicEnv.tokenMint;
  return (
    <>
      <section className="rk-hero" aria-labelledby="home-title">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container relative flex min-h-[calc(100svh-4rem)] flex-col pb-8 pt-4 lg:pb-10 lg:pt-6">
          <h1 id="home-title" className="rk-display rk-hero-title pointer-events-none relative z-0 select-none whitespace-nowrap text-center lg:absolute lg:inset-x-0 lg:top-2">
            RAKAZA
          </h1>

          <div className="relative z-10 grid flex-1 gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)] lg:items-end">
            <CharacterStage variant="hero" controls="basic" controlsClassName="left-3 top-3 lg:bottom-3 lg:top-auto" className="order-1 h-[min(62svh,34rem)] min-h-[22rem] !overflow-visible lg:order-2 lg:h-full lg:min-h-[34rem]">
              <div className="pointer-events-none absolute inset-x-[2%] lg:inset-x-[-4%] top-[52%] z-10 h-[20%] -rotate-6 rounded-[50%] border-2 border-dotted border-white/45" aria-hidden="true" />
              <span className="rk-orb pointer-events-none absolute left-[6%] top-[52%] z-10 size-9 text-[var(--rk-honey)]" aria-hidden="true" />
              <span className="rk-orb pointer-events-none absolute right-[6%] top-[46%] z-10 size-9 text-[var(--rk-pink)]" aria-hidden="true" />
              <Link href="/#checker" className="absolute left-[2%] top-[66%] z-10 flex lg:left-[0%] lg:top-[70%] max-w-[11rem] items-center gap-2 rounded-2xl border-2 border-[var(--rk-ink)] bg-white px-3 py-1.5 text-xs font-extrabold leading-tight text-[var(--rk-ink)] shadow-[3px_3px_0_var(--rk-ink)] sm:max-w-[13rem] sm:text-sm">
                <span className="rk-orb size-5 shrink-0 text-[var(--rk-mint)]" aria-hidden="true" />
                Risk check your coins on pump.fun
              </Link>
              <div className="pointer-events-none absolute right-0 top-[2%] z-10 w-[min(9.4rem,46%)] lg:-right-[24%] lg:top-[10%] lg:w-[min(15rem,62%)] rounded-2xl rounded-bl-sm border-2 border-[var(--rk-ink)] bg-white p-3 text-[var(--rk-ink)] shadow-[4px_4px_0_var(--rk-ink)]" data-testid="speech-bubble">
                <p className="text-sm font-extrabold leading-tight">
                  Rakaza <span className="ml-1 font-mono text-[0.65rem] font-normal text-emerald-600">● preview</span>
                </p>
                <p className="mt-1 text-sm leading-snug">hi, I’m Rakaza 💜 welcome to my world.</p>
              </div>
            </CharacterStage>

            <div className="order-2 min-w-0 lg:order-1 lg:pb-2">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-[var(--rk-ink)] bg-white py-1 pl-1 pr-1 text-[var(--rk-ink)] shadow-[0_3px_0_var(--rk-pink)] lg:order-last" data-testid="ca-pill">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--rk-violet)] font-mono text-[0.65rem] font-bold text-white">CA</span>
                <span className="min-w-0 truncate font-mono text-xs">{mint ? short(mint) : "announced at launch"}</span>
                <button type="button" disabled={!mint} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--rk-ink)] px-3 text-xs font-bold text-white disabled:opacity-50" aria-label="Copy contract address">
                  <Copy className="size-3" aria-hidden="true" /> Copy
                </button>
              </div>
              <p className="rk-serif mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[1.02] text-white">
                An AI character
                <br />
                <span className="text-[var(--rk-honey)]">who lives on Solana</span>
              </p>
              <p className="mt-4 max-w-md text-[0.98rem] leading-relaxed text-white/90">
                Talk to her, read her diary, launch a coin on devnet, and browse every token launched through her. She never asks for seed phrases and her tools can’t sign or spend.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/talk" className="rk-btn rk-btn-ink">
                  Talk to Rakaza <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link href="#world" className="rk-btn rk-btn-white">
                  Explore <ArrowDown className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div id="world" className="order-3 min-w-0 scroll-mt-24 lg:pb-2">
              <div className="flex items-baseline justify-between">
                <h2 className="rk-display !text-[1.6rem] !leading-none sm:!text-[2rem]" style={{ textShadow: "none", color: "#fff" }}>
                  Her world
                </h2>
                <span className="font-mono text-xs text-white/80">({String(WORLD.length).padStart(2, "0")})</span>
              </div>
              <ul className="mt-3 border-t border-white/35">
                {WORLD.map((w) => (
                  <li key={w.label} className="border-b border-white/35">
                    <Link href={w.href} className="group flex min-h-10 items-center gap-3 py-1.5 text-[0.9rem] font-bold text-white hover:text-[var(--rk-honey)]">
                      <span className="size-3 shrink-0 rounded-full border-2 border-white" style={{ background: w.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 leading-tight">{w.label}</span>
                      <span className="hidden shrink-0 font-mono text-[0.68rem] font-normal text-white/80 min-[430px]:inline">{w.note}</span>
                      {w.icon === "down" ? <ArrowDown className="size-4 shrink-0" aria-hidden="true" /> : <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 -mb-6 mt-[-1.5rem] overflow-x-clip pt-6" aria-hidden="true">
        <Tape />
        <div className="-mt-9">
          <Tape pink />
        </div>
      </div>

      <section className="overflow-x-clip bg-[var(--rk-honey)] pb-24 pt-16 text-[var(--rk-ink)] md:pb-32 md:pt-24" aria-labelledby="intro-h">
        <div className="rk-container relative">
          <h2 id="intro-h" className="rk-display !text-[clamp(2.8rem,8.4vw,7.5rem)] !leading-[0.9] !text-[var(--rk-ink)]" style={{ textShadow: "none", fontVariationSettings: '"wdth" 118' }}>
            A character,
            <br />
            not a chatbot.
          </h2>
          <p className="mt-8 max-w-xl text-xl font-extrabold leading-snug">She talks, she remembers, and she checks your coins.</p>
          <p className="mt-6 font-mono text-[0.72rem] uppercase tracking-wider">Next: meet Rakaza ↓</p>
          <div className="absolute right-2 top-0 grid size-28 rotate-12 place-items-center rounded-full border-2 border-[var(--rk-ink)] bg-[var(--rk-pink)] text-center font-display text-xs font-black leading-tight text-[var(--rk-ink)] shadow-[4px_4px_0_var(--rk-ink)] md:size-36 md:text-sm" aria-hidden="true">
            NO SEED
            <br />
            PHRASES
            <br />
            EVER
          </div>
        </div>
      </section>

      <section id="meet" className="rk-hero rk-hero-deep scroll-mt-20 pb-16 pt-14 md:pb-24 md:pt-20" aria-labelledby="meet-h">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container relative">
          <h2 id="meet-h" className="rk-display text-center !text-[clamp(2.6rem,9vw,8rem)] !leading-[0.95]" style={{ fontVariationSettings: '"wdth" 115' }}>
            Meet Rakaza
          </h2>
          <p className="rk-serif mx-auto mt-3 text-center text-[clamp(1.3rem,2.6vw,2rem)] text-white">An AI character who lives on Solana</p>
          <div className="mx-auto mt-8 max-w-5xl">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border-2 border-[var(--rk-lav)] bg-[#1a0b46] px-4 py-3 font-mono text-xs text-white shadow-[0_4px_0_var(--rk-pink)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--rk-pink)]" aria-hidden="true" /> Market
              </span>
              <span className="text-white/80">Price, 24h, market cap and liquidity appear here once the Rakaza token launches on mainnet</span>
              <span className="ml-auto text-white/70">Data: DexScreener · Not financial advice</span>
            </div>
            <figure className="mt-5">
              <div className="rk-hero rk-hero-deep relative aspect-[4/5] rounded-[1.6rem] border-2 border-[var(--rk-lav)] shadow-[0_6px_0_var(--rk-pink)] sm:aspect-[16/10]">
                <div className="rk-rays" aria-hidden="true" />
                <div className="rk-dots" aria-hidden="true" />
                <div className="absolute inset-0">
                  <CharacterStage variant="panel" controls="basic" wheelZoom className="size-full" />
                </div>
                <span className="absolute left-3 top-3 z-20 rounded-full border-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] px-3 py-1 font-mono text-xs font-bold text-[var(--rk-ink)]">Rakaza · AI character</span>
                <span className="pointer-events-none absolute bottom-3 right-4 z-20 hidden font-mono sm:block text-[0.7rem] text-white/85">drag to turn her · scroll to zoom</span>
              </div>
              <figcaption className="mt-3 font-mono text-xs text-white/85">
                <strong>Figure 1.</strong> Rakaza, running live in your browser. Not pre-rendered. Not a real person. Close enough.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <Panel id="evaluations" kicker="Evaluations" title="What she can and can’t do, in plain language." blurb="What she is built to do, in plain words. These are design goals, not test scores: no numbers are published until real tests exist.">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Talks like a person", "Streaming chat and live voice, with a 3D character that lip-syncs."],
            ["Knows the coin world", "Reads real Solana and pump.fun data through her tools."],
            ["Admits what she doesn’t know", "She’s an AI and can be wrong. Nothing she says is financial advice."],
            ["Keeps your secrets safe", "She never asks for a seed phrase or private key, and her tools can’t sign, send or spend."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border-2 border-[var(--rk-line)] p-4">
              <p className="text-sm font-bold">{t}</p>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel id="model-card" kicker="Model card" title="How Rakaza works, and where she stops." blurb="The brain, the voice, the limits, and what data she sees.">
        <dl className="divide-y divide-[var(--rk-line)] rounded-xl border-2 border-[var(--rk-line)] text-sm">
          {[
            ["Brain", "River, an AI language model, writes her replies."],
            ["Voice", "Deepgram speech-to-text and text-to-speech, with lip-sync on the 3D character."],
            ["Memory", "Keeps the context of your current chat. A holder level badge and daily message counters show on the Talk page."],
            ["Limits", "Rate limited per IP and session, 18+, and she never gives financial advice."],
            ["Data she sees", "Public Solana, pump.fun and market data. Never your keys."],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-3 px-4 py-3 sm:grid-cols-[8rem_1fr]">
              <dt className="font-bold">{k}</dt>
              <dd className="text-xs leading-snug text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel id="playground" kicker="Playground" title="Talk to Rakaza." blurb="A preview of the chat. The real conversation, with voice, is on the Talk page.">
        <div className="rounded-xl border-2 border-[var(--rk-line)] p-4">
          <p className="rounded-2xl rounded-bl-sm border-2 border-[var(--rk-line)] bg-card px-3 py-2 text-sm">hi, I’m Rakaza 💜 what’s up?</p>
          <p className="mt-3 text-xs text-muted-foreground">This is a preview. Open the Talk page to chat with her for real.</p>
          <Link href="/talk" className="rk-btn rk-btn-honey mt-4 inline-flex">
            Open Talk <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Panel>

      <div className="rk-container grid gap-6 pb-16 pt-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="rk-card rk-card-hard min-w-0 scroll-mt-24" aria-labelledby={`${s.id}-h`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id={`${s.id}-h`} className="rk-h2 text-2xl">
                {s.title}
              </h2>
              <span className="rk-pill !min-h-7 shrink-0 text-[0.7rem]">{s.status}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
            <Link href={s.href} className="rk-btn rk-btn-white rk-btn-sm mt-4 inline-flex">
              {s.cta}
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}

function Tape({ pink = false }: { pink?: boolean }) {
  return (
    <div className={`rk-tape !my-0 ${pink ? "rk-tape-pink" : ""}`}>
      <div className="rk-tape-track">
        {Array.from({ length: 2 }).map((_, i) => (
          <span key={i} className="flex gap-8">
            {Array.from({ length: 4 }).map((__, j) => (
              <span key={j} className="flex gap-8">
                <span>Rakaza</span>
                <span className={pink ? "" : "text-[var(--rk-pink)]"}>♥</span>
                <span>{pink ? "Texts back instantly" : "AI character"}</span>
                <span className={pink ? "" : "text-[var(--rk-mint)]"}>✦</span>
                <span>{pink ? "Not financial advice" : "Built on Solana"}</span>
                <span className={pink ? "" : "text-[var(--rk-pink)]"}>♥</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

function Panel({ id, kicker, title, blurb, children }: { id: string; kicker: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t-2 border-[var(--rk-line)] py-16 md:py-24" aria-labelledby={`${id}-h`}>
      <div className="rk-container">
        <p className="flex items-center gap-2 font-mono text-xs">
          <span className="size-2 rounded-full bg-[var(--rk-honey)]" aria-hidden="true" /> {kicker}
        </p>
        <h2 id={`${id}-h`} className="rk-display mt-4 max-w-3xl !text-[clamp(2.2rem,5.6vw,4.6rem)] !leading-[0.98] !text-foreground" style={{ textShadow: "none", fontVariationSettings: '"wdth" 112' }}>
          {title}
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{blurb}</p>
        <div className="mt-8 max-w-4xl">{children}</div>
      </div>
    </section>
  );
}
