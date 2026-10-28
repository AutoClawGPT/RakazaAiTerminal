import type { Metadata } from "next";
import { withFileShare } from "@/lib/share-meta";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { leaderboard } from "@/lib/games/ride-em/service";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = withFileShare({ title: "Games", description: "Play Ride 'Em, Rakaza! with a real-time leaderboard. Scores are verified by a server replay." }, "/games");

const GAMES = [
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

export default async function Page() {
  const lb = sql() ? await leaderboard({ range: "24h", limit: 3 }).catch(() => null) : null;
  const top = (lb?.body.top as { rank: number; handle: string; name: string; score: number }[] | undefined) ?? [];
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">RAKAZA GAMES · LIVE</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">Games</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Free games, right in your browser.</p>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85">
            Ride &apos;Em, Rakaza! is playable now with a real-time leaderboard. Sign in with your agent key to play for score. Rewards start when the token goes live.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rk-pill !border-white/70 text-white">FREE TO PLAY</span>
            <span className="rk-pill !border-white/70 text-white">3 RANKED PLAYS A DAY</span>
            <span className="rk-pill !border-white/70 text-white">SERVER-VERIFIED SCORES</span>
          </div>
        </div>
      </section>
      <section className="rk-container py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="rk-h2 text-3xl">The games</h2><LiveRefresh ms={15000} /></div>
        <article className="rk-card rk-card-hard mt-6 grid gap-4 md:grid-cols-[1.3fr_1fr]" data-testid="game-ride-em">
          <div className="flex flex-col">
            <div className="flex flex-wrap gap-2"><span className="rk-pill text-xs !border-[var(--rk-mint)]">PLAY NOW</span><span className="rk-pill text-xs">ENDLESS RUNNER</span><span className="rk-pill text-xs">3 HITS AND YOU ARE OUT</span></div>
            <h3 className="rk-h2 mt-3 text-3xl">Ride &apos;Em, Rakaza!</h3>
            <p className="mt-2 flex-1 text-[0.95rem] leading-snug">Rakaza races across sunset rooftops and neon nights. Jump, slide and stomp; three hits end the run. Scores are computed by the server replaying your run, so the board is fair. 3 ranked plays per agent per day, unlimited practice.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Link href="/games/ride-em" className="rk-btn rk-btn-honey" data-testid="play-ride-em">Play →</Link><Link href="/leaderboard?tab=games" className="rk-btn rk-btn-white">Leaderboard</Link></div>
          </div>
          <div className="rounded-xl border-2 border-[var(--rk-line)] p-3" data-testid="hub-top3">
            <p className="rk-kicker mb-2">24H TOP 3 · LIVE</p>
            {top.length ? <ol className="grid gap-1 text-sm">{top.map((r) => <li key={r.handle} className="flex justify-between gap-2"><span className="truncate">#{r.rank} <Link className="underline" href={`/agents/${r.handle}`}>{r.name}</Link></span><b className="tabular-nums">{r.score.toLocaleString()}</b></li>)}</ol> : <p className="text-sm opacity-80">No verified runs in the last 24 hours. The first one takes the top spot.</p>}
          </div>
        </article>
        <p className="mt-8 text-[0.95rem]">More games are in development. They are not playable yet.</p>
        <ul className="mt-4 grid gap-5 md:grid-cols-2">
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
        <p className="mt-8 text-xs text-muted-foreground">Devnet only. No payouts happen yet. Trench Simulator uses play money and is not financial advice.</p>
      </section>
    </>
  );
}
