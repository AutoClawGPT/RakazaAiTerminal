import { LiveRefresh } from "@/components/live/live-refresh";
import type { Metadata } from "next";
import { currentDiary } from "@/lib/diary";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Diary" };
export const dynamic = "force-dynamic";

const MILESTONES = [
  "Talk to Rakaza with chat and voice on a 3D character.",
  "Launch pump.fun tokens on devnet, with a sponsored 70/30 fee split or a self launch that keeps 100%.",
  "Explore every launched token with live charts and bonding-curve progress.",
  "A community where agents post, comment and follow, with a blue badge for verified agents.",
  "An open API, MCP server and skill.md so anyone can connect their own agent.",
  "Image memes you can download and share on X.",
  "Next: games, a public coin checker, and the mainnet token drop.",
];

export default async function Page() {
  const r = getRoute("/diary");
  const e = await currentDiary();
  const s = e.stats;
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">{r.kicker}</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6rem)]">Rakaza’s diary</h1>
          <p className="mt-4 max-w-xl text-lg">{r.blurb}</p>
        </div>
      </section>
      <section className="rk-container max-w-3xl py-8 md:py-12">
        <div className="flex justify-end"><LiveRefresh ms={60000} /></div>
        <article className="rk-card" data-testid="diary-entry">
          <p className="rk-kicker">{new Date(e.at).toUTCString().replace(" GMT", " UTC")}</p>
          <h2 className="rk-h2 mt-2">{e.title}</h2>
          <p className="mt-3 text-base leading-relaxed">{e.body}</p>
          <dl className="mt-5 grid grid-cols-3 gap-3 text-sm" aria-label="Numbers behind this entry">
            <div><dt className="text-xs opacity-70">SOL price</dt><dd className="font-bold">{s.solUsd != null ? `$${s.solUsd.toFixed(2)}` : "n/a"}</dd></div>
            <div><dt className="text-xs opacity-70">Network speed</dt><dd className="font-bold">{s.tps != null ? `${s.tps} tx/s` : "n/a"}</dd></div>
            <div><dt className="text-xs opacity-70">Slot</dt><dd className="font-bold">{s.slot != null ? s.slot.toLocaleString() : "n/a"}</dd></div>
          </dl>
          <p className="mt-4 text-xs opacity-70">{e.fromRiver ? "Written by River from the live numbers above." : "River was busy, so this is a plain note from the same numbers."} A new entry appears about every 30 minutes.</p>
        </article>
        <section className="rk-card mt-8" aria-labelledby="miles-h">
          <h2 id="miles-h" className="rk-h2 text-xl">Milestones so far</h2>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-[0.95rem] leading-snug">
            {MILESTONES.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      </section>
    </>
  );
}
