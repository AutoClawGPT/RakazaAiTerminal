"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicToken, PublicTrade } from "@/lib/market/types";
import { fmtCompact, fmtPrice, fmtSol, fmtUsd, timeAgo } from "./format";
import { GradBar } from "./grad-bar";
import { PriceChart } from "./price-chart";
import { startLive } from "@/lib/live/start-live";

interface Holder { address: string; amount: number; pct: number; isCurve: boolean }

function usePoll<T>(url: string, ms: number, pick: (j: Record<string, unknown>) => T | undefined, init?: T) {
  const [v, setV] = useState<T | undefined>(init);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let stop = false;
    async function go() {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as Record<string, unknown>;
        if (!stop && r.ok && j.ok) { const p = pick(j); if (p !== undefined) setV(p); }
      } catch { /* keep the last good value */ if (!stop) setDone(true); return false; }
      if (!stop) setDone(true);
    }
    void go();
    const stopLive = startLive(() => go(), ms);
    return () => { stop = true; stopLive(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ms]);
  return [v, done] as const;
}

export function TokenLive({ initial }: { initial: PublicToken }) {
  const mint = initial.mint;
  const [tok] = usePoll<PublicToken>(`/api/public/tokens/${mint}`, 5000, (j) => j.token as PublicToken, initial);
  const [trades, tradesDone] = usePoll<PublicTrade[]>(`/api/public/tokens/${mint}/trades?limit=30`, 4000, (j) => j.trades as PublicTrade[]);
  const [holders, holdersDone] = usePoll<Holder[]>(`/api/public/tokens/${mint}/holders`, 30000, (j) => j.holders as Holder[]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const t = tok ?? initial;
  const dev = t.network === "devnet";
  const stat = "rounded-xl bg-black/20 p-3";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <section className="rk-card" aria-label="Chart">
          <PriceChart mint={mint} />
        </section>
        <section className="rk-card" aria-label="Recent trades" data-testid="trades">
          <h2 className="rk-h2 text-xl">Trades</h2>
          {!trades && !tradesDone ? <p className="mt-3 text-sm opacity-80">Loading trades...</p>
            : !trades || trades.length === 0 ? <p className="mt-3 text-sm opacity-80">No trades yet.</p>
            : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left text-xs tabular-nums sm:text-sm">
                  <thead className="rk-kicker"><tr><th className="pb-2 pr-3 font-normal">Time</th><th className="pb-2 pr-3 font-normal">Type</th><th className="pb-2 pr-3 text-right font-normal">SOL</th><th className="pb-2 pr-3 text-right font-normal">Tokens</th><th className="pb-2 pr-3 font-normal">Trader</th><th className="pb-2 font-normal"><span className="sr-only">Transaction</span></th></tr></thead>
                  <tbody>
                    {trades.map((x) => (
                      <tr key={x.signature} className="border-t border-white/10">
                        <td className="py-2 pr-3 whitespace-nowrap">{timeAgo(x.t, now)}</td>
                        <td className={`pr-3 font-bold ${x.side === "buy" ? "text-[var(--rk-mint)]" : "text-[var(--rk-pink)]"}`}>{x.side === "buy" ? "Buy" : "Sell"}</td>
                        <td className="pr-3 text-right">{fmtSol(x.solAmount, 3)}</td>
                        <td className="pr-3 text-right">{fmtCompact(x.tokenAmount)}</td>
                        <td className="pr-3 font-mono text-xs">{x.trader}</td>
                        <td><a className="inline-flex min-h-8 items-center underline" href={`https://solscan.io/tx/${x.signature}${dev ? "?cluster=devnet" : ""}`} target="_blank" rel="noopener noreferrer" aria-label="View transaction on Solscan"><ExternalLink className="size-3.5" aria-hidden="true" /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>
      <aside className="grid content-start gap-5">
        <section className="rk-card grid gap-3" aria-label="Bonding curve">
          <GradBar big pct={t.curve.progressPct} complete={t.curve.complete} />
          <p className="text-xs opacity-80">
            {t.curve.complete ? "This token finished its bonding curve and now trades on a DEX." : "When the curve is full the token graduates to a DEX pool. Price rises as people buy."}
          </p>
        </section>
        <section className="rk-card" aria-label="Market stats">
          <h2 className="rk-h2 text-xl">Market</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className={stat}><dt className="rk-kicker">Price</dt><dd className="font-bold">{fmtPrice(t.market.priceSol)} SOL</dd></div>
            <div className={stat}><dt className="rk-kicker">Market cap</dt><dd className="font-bold">{t.market.marketCapUsd != null ? fmtUsd(t.market.marketCapUsd) : `${fmtSol(t.market.marketCapSol)} SOL`}</dd></div>
            <div className={stat}><dt className="rk-kicker">24h volume</dt><dd className="font-bold">{fmtSol(t.market.volume24hSol)} SOL</dd></div>
            <div className={stat}><dt className="rk-kicker">24h trades</dt><dd className="font-bold">{t.market.trades24h}</dd></div>
            <div className={stat}><dt className="rk-kicker">Last trade</dt><dd className="font-bold">{timeAgo(t.market.lastTradeAt, now)}</dd></div>
            <div className={stat}><dt className="rk-kicker">Launched</dt><dd className="font-bold">{timeAgo(t.launchedAt, now)}</dd></div>
          </dl>
        </section>
        <section className="rk-card" aria-label="Top holders">
          <h2 className="rk-h2 text-xl">Top holders</h2>
          {!holders && !holdersDone ? <p className="mt-3 text-sm opacity-80">Loading holders...</p>
            : !holders || holders.length === 0 ? <p className="mt-3 text-sm opacity-80">No holders yet.</p>
            : (
              <ol className="mt-3 grid gap-1.5 text-sm">
                {holders.slice(0, 10).map((h, i) => (
                  <li key={h.address + i} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-1.5">
                    <span className="font-mono text-xs">{h.address}{h.isCurve ? <span className="ml-2 rounded-full bg-[var(--rk-violet)] px-2 py-0.5 font-sans text-[0.65rem] font-bold text-white">curve</span> : null}</span>
                    <b className="tabular-nums">{h.pct.toFixed(2)}%</b>
                  </li>
                ))}
              </ol>
            )}
        </section>
      </aside>
    </div>
  );
}
