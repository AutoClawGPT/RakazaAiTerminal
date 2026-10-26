import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { CharacterStage } from "@/components/stage/character-stage";

export const metadata: Metadata = withShare({ title: "Live" }, "/live");

const HOW = [
  "Rakaza is an AI. She streams, reads your questions out loud and answers in her own voice. Everything on her stream is AI-generated.",
  "Your question appears on stream and she reads it aloud, with the name you give (if any).",
  "18+ and PG-13. Ask her anything. No links, @names, emails, phone numbers or addresses, and never financial advice.",
  "One question at a time, one a minute, a few a day. She can’t answer everyone, and the host can skip any question.",
  "Nothing she says is financial advice. She’s an AI and she can be wrong.",
];

export default function LivePage() {
  return (
    <div className="rk-container pb-16 pt-10 md:pt-14">
      <p className="rk-kicker">Live show</p>
      <h1 className="rk-display mt-3 !text-[clamp(2.6rem,9vw,6rem)] !leading-[0.95]" style={{ textShadow: "none", color: "var(--foreground)" }}>
        Rakaza, live
      </h1>
      <p className="rk-serif mt-4 max-w-xl text-2xl leading-tight">She streams and answers your questions out loud. Send her one here while she’s live.</p>
      <p className="mt-3 font-mono text-xs text-muted-foreground">An AI on stream · 18+ · PG-13 · not financial advice · no show is running yet</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="rk-card rk-card-hard overflow-hidden !p-0" aria-label="Live stage">
          <div className="rk-hero relative aspect-[4/3] min-h-[22rem] sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[30rem]">
            <div className="rk-rays" aria-hidden="true" />
            <CharacterStage variant="panel" controls="full" className="h-full" />
            <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rk-ink)] bg-white px-3 py-1 font-mono text-[0.7rem] font-bold text-[var(--rk-ink)]">
              <span className="size-1.5 rounded-full bg-zinc-400" aria-hidden="true" /> OFFLINE
            </span>
          </div>
        </section>

        <div className="grid content-start gap-6">
          <section className="rk-card rk-card-hard" aria-labelledby="live-off">
            <span className="rk-pill !min-h-7 text-[0.7rem]">OFFLINE</span>
            <h2 id="live-off" className="rk-h2 mt-3 text-2xl">
              She’s not live right now.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Her next show will be announced on her socials once they exist. Until then she waits on the stage.</p>
          </section>
          <section className="rk-card rk-card-hard" aria-labelledby="live-ask">
            <h2 id="live-ask" className="rk-h2 text-xl">
              Ask her something
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Her show is for adults: 18+ only, PG-13, and she’s an AI.</p>
            <button type="button" disabled className="rk-btn rk-btn-honey mt-4 disabled:opacity-60">
              I’m 18 or older
            </button>
          </section>
        </div>
      </div>

      <h2 className="mt-10 text-sm font-bold">How her show works</h2>
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {HOW.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
    </div>
  );
}
