import Link from "next/link";
import type { PublicToken } from "@/lib/market/types";
import { fmtSol, fmtUsd, timeAgo } from "./format";
import { GradBar } from "./grad-bar";

export function TokenImage({ src, name, className = "size-14" }: { src: string | null; name: string; className?: string }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  // The letter tile sits underneath, so a slow or broken image never leaves an empty box.
  return (
    <span className={`${className} relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-[var(--rk-line)] bg-[var(--rk-violet)] text-xl font-black text-white`}>
      <span aria-hidden="true">{letter}</span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : null}
    </span>
  );
}

export function TokenCard({ t, now }: { t: PublicToken; now: number }) {
  const mcap = t.market.marketCapUsd != null ? fmtUsd(t.market.marketCapUsd) : `${fmtSol(t.market.marketCapSol)} SOL`;
  return (
    <li>
      <Link
        href={`/token/${t.mint}`}
        className="rk-card flex h-full min-h-11 flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rk-honey)]"
        data-testid="token-card"
      >
        <div className="flex items-start gap-3">
          <TokenImage src={t.image} name={t.name} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <b className="truncate text-base leading-tight">{t.name}</b>
              <span className="rounded-full border border-[var(--rk-line)] px-2 py-0.5 text-[0.7rem] font-bold">${t.symbol}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-xs opacity-80">{t.description || "No description."}</p>
          </div>
        </div>
        <GradBar pct={t.curve.progressPct} complete={t.curve.complete} />
        <dl className="mt-auto grid grid-cols-3 gap-2 text-xs">
          <div><dt className="rk-kicker">Mkt cap</dt><dd className="font-bold tabular-nums">{mcap}</dd></div>
          <div><dt className="rk-kicker">24h vol</dt><dd className="font-bold tabular-nums">{fmtSol(t.market.volume24hSol)} SOL</dd></div>
          <div><dt className="rk-kicker">Age</dt><dd className="font-bold">{timeAgo(t.launchedAt, now)}</dd></div>
        </dl>
      </Link>
    </li>
  );
}
