"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { radarAction } from "@/app/(dash)/scanner/actions";
import type { Lookalike } from "@/lib/launch/radar";

const money = (n?: number) => (n == null ? "unknown" : `$${Math.round(n).toLocaleString()}`);

export function RadarTool() {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [mint, setMint] = useState("");
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ found: Lookalike[]; checked: number; at: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(async () => {
    setBusy(true); setErr("");
    const r = await radarAction({ mint, name, ticker });
    if (r.ok) setRes({ found: r.found, checked: r.checked, at: new Date().toLocaleTimeString() });
    else setErr(r.error);
    setBusy(false);
  }, [mint, name, ticker]);

  useEffect(() => {
    if (!auto) return;
    timer.current = setInterval(() => void scan(), 5 * 60 * 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, scan]);

  return (
    <div className="grid gap-5">
      <SlidePanel title="Look for copycats" hint="Same or near-same names, tickers and addresses on Solana" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="r-name">Token name</label><input id="r-name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
          <div><label className={labelCls} htmlFor="r-tick">Ticker</label><input id="r-tick" className={`${fieldCls} font-mono`} value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={20} /></div>
          <div className="sm:col-span-2"><label className={labelCls} htmlFor="r-mint">Your mint address (optional)</label><input id="r-mint" className={`${fieldCls} font-mono`} value={mint} onChange={(e) => setMint(e.target.value.trim())} spellCheck={false} autoComplete="off" /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="rk-btn rk-btn-mint" disabled={busy || (!name && !ticker)} onClick={() => void scan()} data-testid="radar-go">{busy ? "Scanning…" : "Scan now"}</button>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[var(--rk-honey)]" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Rescan every 5 minutes while this page is open</label>
        </div>
        {err ? <p className="mt-3 text-sm font-semibold text-red-400" role="alert" data-testid="radar-err">{err}</p> : null}
      </SlidePanel>
      <SlidePanel title="Results" hint={res ? `Checked ${res.checked} tokens at ${res.at}` : "Nothing scanned yet"} defaultOpen>
        {!res ? <p className="text-sm opacity-80">Run a scan to see lookalikes here.</p> : res.found.length === 0 ? <p className="text-sm" data-testid="radar-none">No lookalikes found among {res.checked} tokens checked.</p> : (
          <ul className="grid gap-3" data-testid="radar-list">
            {res.found.map((f) => (
              <li key={f.mint} className="rounded-2xl border border-white/15 p-3 text-sm">
                <div className="flex items-start justify-between gap-2"><b>{f.name} ({f.symbol})</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.risk >= 60 ? "bg-red-400 text-black" : "bg-[var(--rk-honey)] text-black"}`}>risk {f.risk}</span></div>
                <p className="mt-1 break-all font-mono text-xs opacity-80">{f.mint}</p>
                <p className="mt-1">{f.why.join(" · ")}</p>
                <p className="mt-1 text-xs opacity-80">Liquidity {money(f.liquidityUsd)} · Market cap {money(f.marketCapUsd)}{f.ageHours != null ? ` · ${f.ageHours < 48 ? `${f.ageHours.toFixed(0)}h` : `${(f.ageHours / 24).toFixed(0)}d`} old` : ""}</p>
                <a className="mt-1 inline-block min-h-11 py-2 text-xs underline" href={f.url} target="_blank" rel="noreferrer">Open on DexScreener</a>
              </li>
            ))}
          </ul>
        )}
      </SlidePanel>
    </div>
  );
}
