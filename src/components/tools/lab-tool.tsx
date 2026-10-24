"use client";
import { useEffect, useMemo, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { LAB_PRESETS, simulate } from "@/lib/tools/curve";

const KEY = "rk.lab";
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function LabTool() {
  const [dev, setDev] = useState(1);
  const [wallets, setWallets] = useState<number[]>([]);
  const [solUsd, setSolUsd] = useState(150);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (v && typeof v.dev === "number" && Array.isArray(v.wallets)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDev(v.dev);
        setWallets(v.wallets.filter((x: unknown) => typeof x === "number"));
        if (typeof v.solUsd === "number") setSolUsd(v.solUsd);
      }
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ dev, wallets, solUsd }));
    } catch {}
  }, [hydrated, dev, wallets, solUsd]);

  const sim = useMemo(() => simulate([{ wallet: "Dev", sol: dev }, ...wallets.map((sol, i) => ({ wallet: `Wallet ${i + 1}`, sol }))], solUsd), [dev, wallets, solUsd]);

  return (
    <div className="grid gap-5">
      <SlidePanel title="Your buys" hint="Dev buy and extra wallets, in order" defaultOpen>
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Presets">
          {LAB_PRESETS.map((p) => (
            <button key={p.name} type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => { setDev(p.dev); setWallets(p.wallets); }}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lab-dev">Dev buy (SOL)</label>
            <input id="lab-dev" className={fieldCls} type="number" min={0} step="0.1" inputMode="decimal" value={dev} onChange={(e) => setDev(Math.max(0, Number(e.target.value)))} />
          </div>
          <div>
            <label className={labelCls} htmlFor="lab-sol">SOL price (USD)</label>
            <input id="lab-sol" className={fieldCls} type="number" min={1} inputMode="decimal" value={solUsd} onChange={(e) => setSolUsd(Math.max(1, Number(e.target.value)))} />
          </div>
        </div>
        {wallets.map((w, i) => (
          <div key={i} className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls} htmlFor={`lw${i}`}>Wallet {i + 1} (SOL)</label>
              <input id={`lw${i}`} className={fieldCls} type="number" min={0} step="0.1" inputMode="decimal" value={w} onChange={(e) => setWallets((ws) => ws.map((x, j) => (j === i ? Math.max(0, Number(e.target.value)) : x)))} />
            </div>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setWallets((ws) => ws.filter((_, j) => j !== i))} aria-label={`Remove wallet ${i + 1}`}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="rk-btn rk-btn-honey rk-btn-sm mt-3" onClick={() => setWallets((w) => [...w, 1])} disabled={wallets.length >= 9}>
          Add wallet
        </button>
      </SlidePanel>

      <SlidePanel title="Result" hint={`${fmt(sim.progress * 100, 1)}% of the curve sold`} defaultOpen>
        <div className="h-3 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(sim.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Curve progress">
          <div className="h-full bg-[var(--rk-honey)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${sim.progress * 100}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Market cap", `$${fmt(sim.marketCapUsd, 0)}`],
            ["Start cap", `${fmt(sim.startMcSol)} SOL`],
            ["SOL raised", fmt(sim.raised, 3)],
            ["Graduated", sim.graduated ? "Yes" : "No"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="rk-kicker text-muted-foreground">{k}</dt>
              <dd className="mt-1 font-mono font-bold" data-testid={`lab-${k.toLowerCase().replace(/ /g, "-")}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Ownership per wallet</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1">Wallet</th>
              <th scope="col">SOL</th>
              <th scope="col" className="text-right">Tokens</th>
              <th scope="col" className="text-right">Supply</th>
            </tr>
          </thead>
          <tbody>
            {sim.rows.map((r) => (
              <tr key={r.wallet} className="border-t border-border" data-testid="lab-row">
                <th scope="row" className="py-1.5 text-left font-semibold">{r.wallet}</th>
                <td className="font-mono text-xs">{fmt(r.sol)}</td>
                <td className="text-right font-mono text-xs">{fmt(r.tokens, 0)}</td>
                <td className="text-right font-mono text-xs">{fmt(r.pct, 2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sim.warnings.length ? (
          <ul className="mt-4 space-y-2" role="status">
            {sim.warnings.map((w) => (
              <li key={w.text} className={`rounded-xl border-2 p-3 text-sm ${w.level === "bad" ? "border-[var(--rk-pink)]" : "border-[var(--rk-honey)]"}`}>{w.text}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-xs text-muted-foreground">Estimates only, with a simulated 1% fee on each buy. Real launches may differ.</p>
      </SlidePanel>
    </div>
  );
}
