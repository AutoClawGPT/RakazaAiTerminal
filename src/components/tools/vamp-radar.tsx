"use client";
import { useCallback, useEffect, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { vampScanAction } from "@/app/(dash)/scanner/actions";
import type { VampResult } from "@/lib/launch/vamp";

const WATCH = "rk.vamp.watch";
export interface Watched { mint: string; symbol: string; flagged: number; at: string }

const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function loadWatch(): Watched[] {
  try { const v = JSON.parse(localStorage.getItem(WATCH) ?? "[]"); return Array.isArray(v) ? v.filter((w) => w && typeof w.mint === "string") : []; } catch { return []; }
}
export function saveWatch(list: Watched[]) { try { localStorage.setItem(WATCH, JSON.stringify(list.slice(0, 50))); } catch { /* storage full or blocked */ } }

/** The grindcore-style result block: header with "N flagged · time", then one row per lookalike. */
export function VampRows({ r, busy, onScan, onWatch, watched }: { r: VampResult; busy?: boolean; onScan?: () => void; onWatch?: () => void; watched?: boolean }) {
  return (
    <div className="grid gap-3" data-testid="vamp-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><b>{r.token.symbol || r.token.name}</b> <span className="font-mono text-xs opacity-70">{short(r.mint)}</span></p>
        <p className="text-sm font-semibold" data-testid="vamp-count">{r.flagged} flagged · {when(r.scannedAt)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onScan ? <button type="button" className="rk-btn rk-btn-mint rk-btn-sm" disabled={busy} onClick={onScan} data-testid="vamp-rescan">{busy ? "Scanning…" : "Scan now"}</button> : null}
        {onWatch ? <button type="button" className="rk-btn rk-btn-white rk-btn-sm" disabled={watched} onClick={onWatch} data-testid="vamp-watch">{watched ? "On watchlist" : "Add to watchlist"}</button> : null}
        <a className="rk-btn rk-btn-white rk-btn-sm" href={`https://dexscreener.com/solana/${r.mint}`} target="_blank" rel="noreferrer">Chart ↗</a>
      </div>
      <p className="text-xs opacity-80" data-testid="vamp-shield">Vamp Shield: {r.shield.grade} (score {r.shield.score}). {r.shield.note}{r.shield.endsMatched ? ` A laptop could copy that in about ${r.shield.laptop}.` : ""} Checked {r.checked} tokens.</p>
      {r.rows.length === 0 ? <p className="text-sm" data-testid="vamp-none">No lookalikes found. Nothing flagged.</p> : (
        <ul className="grid gap-2" data-testid="vamp-rows">
          {r.rows.map((x) => (
            <li key={x.mint} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-2.5 text-sm">
              <span><span className={x.label === "Likely vamp" ? "font-bold text-red-400" : "font-bold text-[var(--rk-honey)]"}>{x.label}</span>{x.text.slice(x.label.length)} <span className="font-mono text-xs opacity-60">{short(x.mint)}</span></span>
              <a className="min-h-8 text-xs underline" href={x.chart} target="_blank" rel="noreferrer">Chart ↗</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Paste a token address, get a real Vamp Radar + Vamp Shield scan, and keep a watchlist. */
export function VampRadar() {
  const [mint, setMint] = useState("");
  const [res, setRes] = useState<VampResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [watch, setWatch] = useState<Watched[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setWatch(loadWatch()); }, []);

  const scan = useCallback(async (m: string) => {
    setBusy(true); setErr("");
    const r = await vampScanAction(m);
    if (r.ok) {
      setRes(r.result);
      setWatch((w) => { const next = w.map((x) => (x.mint === m ? { ...x, symbol: r.result.token.symbol, flagged: r.result.flagged, at: r.result.scannedAt } : x)); saveWatch(next); return next; });
    } else setErr(r.error);
    setBusy(false);
  }, []);

  const add = () => { if (!res) return; setWatch((w) => { const next = [{ mint: res.mint, symbol: res.token.symbol, flagged: res.flagged, at: res.scannedAt }, ...w.filter((x) => x.mint !== res.mint)]; saveWatch(next); return next; }); };
  const remove = (m: string) => setWatch((w) => { const next = w.filter((x) => x.mint !== m); saveWatch(next); return next; });

  return (
    <div className="grid gap-5">
      <SlidePanel title="Vamp Radar and Shield" hint="Paste a token address. We find every lookalike." defaultOpen>
        <div className="grid gap-3">
          <div>
            <label className={labelCls} htmlFor="v-mint">Token address (CA)</label>
            <input id="v-mint" data-testid="vamp-input" className={`${fieldCls} font-mono`} value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="Paste a Solana token address" autoComplete="off" spellCheck={false} />
          </div>
          <div><button type="button" className="rk-btn rk-btn-mint" disabled={busy || !mint} onClick={() => void scan(mint)} data-testid="vamp-go">{busy && !res ? "Scanning…" : "Scan"}</button></div>
          {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="vamp-err">{err}</p> : null}
          {res ? <VampRows r={res} busy={busy} onScan={() => void scan(res.mint)} onWatch={add} watched={watch.some((w) => w.mint === res.mint)} /> : null}
        </div>
      </SlidePanel>
      <SlidePanel title="Watchlist" hint={`${watch.length} token${watch.length === 1 ? "" : "s"} · saved in this browser`} defaultOpen={watch.length > 0}>
        {watch.length === 0 ? <p className="text-sm opacity-80">Nothing watched yet. Scan a token and press &ldquo;Add to watchlist&rdquo;.</p> : (
          <ul className="grid gap-2" data-testid="vamp-watchlist">
            {watch.map((w) => (
              <li key={w.mint} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-2.5 text-sm">
                <span><b>{w.symbol || "?"}</b> <span className="font-mono text-xs opacity-60">{short(w.mint)}</span> · {w.flagged} flagged · {when(w.at)}</span>
                <span className="flex gap-2">
                  <button type="button" className="rk-btn rk-btn-white rk-btn-sm" disabled={busy} onClick={() => { setMint(w.mint); void scan(w.mint); }}>Scan now</button>
                  <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => remove(w.mint)}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SlidePanel>
    </div>
  );
}
