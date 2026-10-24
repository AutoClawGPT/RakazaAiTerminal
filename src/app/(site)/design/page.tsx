import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Design system" };

const SWATCHES = [
  ["ink", "#170a36"], ["paper", "#f8f5ff"], ["lav", "#e4d9ff"], ["violet", "#6b3bff"], ["violet-deep", "#4a1fd6"],
  ["pink", "#ff4da6"], ["honey", "#ffc933"], ["mint", "#3ff0c3"], ["blue", "#2f5bff"],
];

/** Dev-only reference page (404 in production). Not part of MASTER-TAB-LIST. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="rk-container space-y-10 py-12">
      <header>
        <p className="rk-kicker">Dev only</p>
        <h1 className="rk-display text-[clamp(2.5rem,9vw,6rem)]">Design</h1>
        <p className="rk-serif mt-3 text-3xl">tokens, type, buttons, cards</p>
      </header>
      <section aria-labelledby="sw">
        <h2 id="sw" className="rk-h2 mb-3 text-2xl">Palette</h2>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {SWATCHES.map(([n, c]) => (
            <li key={n} className="text-xs">
              <div className="h-14 rounded-xl border-2 border-[var(--rk-line)]" style={{ background: c }} />
              <div className="mt-1 font-mono">{n}</div>
              <div className="font-mono text-muted-foreground">{c}</div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ty">
        <h2 id="ty" className="rk-h2 mb-3 text-2xl">Type</h2>
        <p className="rk-display text-6xl">Anybody 900 wide</p>
        <p className="rk-serif mt-3 text-4xl">Instrument Serif italic tagline</p>
        <p className="mt-3">Geist body copy, the quick brown fox jumps over the lazy dog.</p>
        <p className="mt-2 font-mono text-sm">Geist Mono 0123456789 · labels and addresses</p>
        <p className="mt-3"><span className="rk-sticker">ドキドキ</span> <span className="font-doki text-sm">Dela Gothic One (pop skin sticker font)</span></p>
      </section>
      <section aria-labelledby="bt">
        <h2 id="bt" className="rk-h2 mb-3 text-2xl">Buttons and pills</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rk-btn rk-btn-honey">Honey</button>
          <button className="rk-btn rk-btn-ink">Ink</button>
          <button className="rk-btn rk-btn-white">White</button>
          <button className="rk-btn rk-btn-mint">Mint</button>
          <button className="rk-btn rk-btn-honey" disabled>Disabled</button>
          <span className="rk-pill">Pill</span>
          <span className="rk-pill" data-active="true">Active pill</span>
        </div>
      </section>
      <section aria-labelledby="cd" className="grid gap-5 md:grid-cols-3">
        <h2 id="cd" className="rk-h2 text-2xl md:col-span-3">Cards</h2>
        <div className="rk-card"><h3 className="rk-h2 text-xl">Plain</h3><p className="mt-2 text-sm text-muted-foreground">Outlined card.</p></div>
        <div className="rk-card rk-card-hard"><h3 className="rk-h2 text-xl">Hard shadow</h3><p className="mt-2 text-sm text-muted-foreground">Offset shadow card.</p></div>
        <div className="rk-card"><h3 className="rk-h2 text-xl">Third</h3><p className="mt-2 text-sm text-muted-foreground">Pop mode recolours these shadows.</p></div>
      </section>
    </div>
  );
}
