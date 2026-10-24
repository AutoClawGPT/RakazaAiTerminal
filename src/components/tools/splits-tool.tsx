"use client";
import { useMemo, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { bpsToPercent, exportSplit, MAX_SHAREHOLDERS, splitEvenly, validateSplit, type Shareholder } from "@/lib/tools/splits";

interface Row extends Shareholder {
  id: number;
}
let uid = 3;

export function SplitsTool({ treasury }: { treasury?: string }) {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, address: "", shareBps: 7000, label: "Launcher" },
    { id: 2, address: treasury ?? "", shareBps: 3000, label: "Platform treasury" },
  ]);
  const [mint, setMint] = useState("");
  const [copied, setCopied] = useState(false);
  const check = useMemo(() => validateSplit(rows), [rows]);
  const json = useMemo(() => exportSplit(mint || "<mint after launch>", rows), [mint, rows]);

  const patch = (id: number, p: Partial<Shareholder>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const even = () => {
    const parts = splitEvenly(rows.length);
    setRows((rs) => rs.map((r, i) => ({ ...r, shareBps: parts[i] })));
  };
  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-5">
      <SlidePanel title="Shareholders" hint={`${rows.length} of ${MAX_SHAREHOLDERS} · ${bpsToPercent(check.totalBps)} allocated`} defaultOpen>
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_8rem_auto]" data-testid="split-row">
              <div>
                <label className={labelCls} htmlFor={`a${r.id}`}>Wallet {i + 1}{r.label ? ` · ${r.label}` : ""}</label>
                <input id={`a${r.id}`} className={`${fieldCls} font-mono`} value={r.address} onChange={(e) => patch(r.id, { address: e.target.value })} placeholder="Solana address" spellCheck={false} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls} htmlFor={`b${r.id}`}>Share (bps)</label>
                <input id={`b${r.id}`} className={fieldCls} type="number" inputMode="numeric" min={1} max={10000} value={r.shareBps} onChange={(e) => patch(r.id, { shareBps: Math.trunc(Number(e.target.value)) })} />
              </div>
              <div className="flex items-end justify-between gap-2 sm:justify-end">
                <span className="font-mono text-sm font-bold">{bpsToPercent(r.shareBps || 0)}</span>
                <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} disabled={rows.length <= 1} aria-label={`Remove wallet ${i + 1}`}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rk-btn rk-btn-honey rk-btn-sm" disabled={rows.length >= MAX_SHAREHOLDERS} onClick={() => setRows((rs) => [...rs, { id: uid++, address: "", shareBps: 1 }])}>
              Add wallet
            </button>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={even}>
              Split evenly
            </button>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setRows([{ id: uid++, address: "", shareBps: 7000, label: "Launcher" }, { id: uid++, address: treasury ?? "", shareBps: 3000, label: "Platform treasury" }])}>
              70 / 30 preset
            </button>
          </div>
          <div role="status" aria-live="polite" className={`rounded-xl border-2 p-3 text-sm ${check.ok ? "border-[var(--rk-mint)]" : "border-[var(--rk-pink)]"}`} data-testid="split-status">
            {check.ok ? (
              <strong>Valid. This list is ready to encode.</strong>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {check.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SlidePanel>

      <SlidePanel title="Export" hint="JSON you can keep or hand to the launcher">
        <label className={labelCls} htmlFor="mint">Mint address (optional)</label>
        <input id="mint" className={`${fieldCls} mb-3 font-mono`} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Filled in after launch" spellCheck={false} />
        <pre className="max-h-72 overflow-auto rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="split-json">{json}</pre>
        <button type="button" className="rk-btn rk-btn-mint rk-btn-sm mt-3" onClick={copy} disabled={!check.ok}>
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </SlidePanel>

      <SlidePanel title="Read this before launching" hint="The split is permanent">
        <p className="text-sm leading-relaxed">
          Once creator fees are shared on-chain, the list cannot be changed. Platform launches always use 70% to the launcher and 30% to the treasury. Nothing on this page sends a transaction.
        </p>
      </SlidePanel>
    </div>
  );
}
