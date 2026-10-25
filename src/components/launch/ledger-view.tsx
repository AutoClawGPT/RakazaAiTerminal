"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { distributeNowAction, ledgerAction } from "@/app/(dash)/history/actions";
import type { Ledger, LedgerRow } from "@/lib/launch/ledger";
import { SlidePanel } from "@/components/tools/tool-frame";

const sol = (l: number) => (l / 1e9).toFixed(l >= 1e7 ? 4 : 6);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const cluster = (n: string) => (n === "mainnet-beta" ? "" : `?cluster=${n}`);
const tx = (sig: string, n: string) => `https://solscan.io/tx/${sig}${cluster(n)}`;
const acct = (a: string, n: string) => `https://solscan.io/account/${a}${cluster(n)}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  live: { label: "live", cls: "bg-emerald-400/90 text-black" },
  creating: { label: "creating", cls: "bg-[var(--rk-honey)] text-black" },
  created_unsplit: { label: "created, split pending", cls: "bg-[var(--rk-honey)] text-black" },
  split_mismatch: { label: "split mismatch", cls: "bg-red-400 text-black" },
  failed: { label: "failed", cls: "bg-red-400 text-black" },
};

export function LedgerView({ view, treasury }: { view: "history" | "fees"; treasury?: string }) {
  const [data, setData] = useState<Ledger | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await Promise.race([ledgerAction(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000))]);
      if (r.ok) { setData(r); setErr(""); } else setErr(r.error);
    } catch (e) { setErr(e instanceof Error && e.message === "timeout" ? "The ledger is taking too long to answer. Press Retry." : "The connection dropped. Showing the last numbers. Retrying on its own."); }
    setBusy(false);
  }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first); }, [load]);
  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused, load]);

  const pay = async (m: string) => {
    setMsg((x) => ({ ...x, [m]: "Sending…" }));
    const r = await distributeNowAction(m);
    const t = !r.ok ? r.error : r.result.sig ? `Sent. ${(r.result.paid ?? []).map((p) => `${short(p.wallet)} got ${sol(p.lamports)} SOL`).join(", ")}` : (r.result.skipped ?? r.result.error ?? "Nothing to send.");
    setMsg((x) => ({ ...x, [m]: t })); void load();
  };

  const who = (a: string) => (a === treasury ? "Platform" : "Creator wallet");

  return (
    <div className="grid gap-5" data-testid={`ledger-${view}`}>
      <section className="rk-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rk-kicker flex items-center gap-2"><span className={`inline-block size-2.5 rounded-full ${paused ? "bg-white/40" : "animate-pulse bg-emerald-400"}`} aria-hidden="true" />{paused ? "Paused" : "Live, refreshes every 10 seconds"}</p>
          <div className="flex gap-2">
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => void load()} disabled={busy} aria-label="Refresh now"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
        {err ? <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-400" role="alert" data-testid="ledger-err">{err}<button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => void load()} disabled={busy}>Retry</button></p> : null}
        {data ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="ledger-totals">
            <div><dt className="rk-kicker">Launches</dt><dd className="text-xl font-bold">{data.totals.launches}</dd></div>
            <div><dt className="rk-kicker">Live</dt><dd className="text-xl font-bold">{data.totals.live}</dd></div>
            <div><dt className="rk-kicker">Fees waiting</dt><dd className="text-xl font-bold">{sol(data.totals.pendingLamports)} SOL</dd></div>
            <div><dt className="rk-kicker">Fees sent</dt><dd className="text-xl font-bold">{sol(data.totals.sentLamports)} SOL</dd></div>
          </dl>
        ) : !err ? <p className="mt-3 text-sm opacity-80">Loading…</p> : null}
        {data?.rpcNote ? <p className="mt-2 text-xs text-amber-300">Some chain data could not be read right now: {data.rpcNote}</p> : null}
      </section>

      {view === "fees" && data ? (
        <section className="rk-card" aria-label="Fees by wallet">
          <h2 className="rk-h2 text-xl">Fees by wallet</h2>
          {data.wallets.length === 0 ? <p className="mt-2 text-sm opacity-80">No launches yet. Wallets appear here as soon as a token launches through the platform.</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm" data-testid="wallet-table">
              <thead><tr className="text-xs uppercase opacity-70"><th className="py-2 pr-3">Wallet</th><th className="pr-3">Tokens</th><th className="pr-3">Waiting</th><th>Sent</th></tr></thead>
              <tbody>{data.wallets.map((w) => (
                <tr key={w.wallet} className="border-t border-white/10">
                  <td className="py-2 pr-3"><a className="font-mono text-xs underline" href={acct(w.wallet, data.rows[0]?.network ?? "devnet")} target="_blank" rel="noreferrer">{short(w.wallet)}</a> {w.wallet === treasury ? <span className="rounded-full bg-white/15 px-2 text-[11px]">platform</span> : null}</td>
                  <td className="pr-3">{w.tokens}</td><td className="pr-3">{sol(w.pendingLamports)} SOL</td><td>{sol(w.sentLamports)} SOL</td>
                </tr>))}</tbody>
            </table></div>)}
        </section>
      ) : null}

      {view === "fees" && data && data.rows.length > 0 ? (
        <section className="rk-card" aria-label="Fees by token">
          <h2 className="rk-h2 text-xl">Fees by token</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm" data-testid="token-fees-table">
            <thead><tr className="text-xs uppercase opacity-70"><th className="py-2 pr-3">Token</th><th className="pr-3">Awaiting claim</th><th className="pr-3">Claimed</th><th>Sent</th></tr></thead>
            <tbody>{data.rows.map((r) => { const sent = r.shares.reduce((a, x) => a + x.sentLamports, 0); return (
              <tr key={r.mint} className="border-t border-white/10"><td className="py-2 pr-3">{r.name} <span className="opacity-70">({r.symbol})</span></td><td className="pr-3">{r.distributableLamports == null ? "unknown" : `${sol(r.distributableLamports)} SOL`}</td><td className="pr-3">{sol(sent)} SOL</td><td>{sol(sent)} SOL</td></tr>); })}</tbody>
          </table></div>
        </section>
      ) : null}

      {data && data.rows.length === 0 ? <section className="rk-card"><p className="text-sm">Nothing launched yet. Launches made from the Launch tab appear here right away, with their transactions and fee split.</p></section> : null}
      {data?.rows.map((r: LedgerRow) => {
        const st = STATUS[r.status] ?? { label: r.status, cls: "bg-white/15" };
        return (
          <SlidePanel key={r.mint} title={`${r.name} (${r.symbol})`} hint={`${new Date(r.createdAt).toLocaleString()} · ${r.network} · ${r.mode === "sponsored" ? "agent launch" : "self launch"}`} defaultOpen={view === "history" && data.rows.length <= 3}>
            <div className="grid gap-3 text-sm" data-testid="ledger-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                {r.splitVerified === true ? <span className="rounded-full bg-emerald-400/90 px-2 py-0.5 text-[11px] font-bold text-black">{r.shares.map((x) => x.shareBps / 100).join("/")} split verified on-chain</span> : r.splitVerified === false ? <span className="rounded-full bg-red-400 px-2 py-0.5 text-[11px] font-bold text-black">split not verified</span> : null}
              </div>
              <p className="break-all">Token <a className="font-mono text-xs underline" href={acct(r.mint, r.network)} target="_blank" rel="noreferrer">{r.mint}</a></p>
              <p className="break-all">Creator <a className="font-mono text-xs underline" href={acct(r.creator, r.network)} target="_blank" rel="noreferrer">{r.creator}</a></p>
              <p className="flex flex-wrap gap-x-4">
                {r.tx1 ? <a className="underline" href={tx(r.tx1, r.network)} target="_blank" rel="noreferrer">Create transaction</a> : <span className="opacity-70">No create transaction yet</span>}
                {r.tx2 ? <a className="underline" href={tx(r.tx2, r.network)} target="_blank" rel="noreferrer">Split transaction</a> : <span className="opacity-70">No split transaction yet</span>}
                {r.devBuyTx ? <a className="underline" href={tx(r.devBuyTx, r.network)} target="_blank" rel="noreferrer">Dev buy transaction</a> : null}
              </p>
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-3 text-xs" data-testid="token-fees">
                <div><dt className="rk-kicker">Awaiting claim</dt><dd className="text-base font-bold">{r.distributableLamports == null ? "unknown" : `${sol(r.distributableLamports)} SOL`}</dd></div>
                <div><dt className="rk-kicker">Claimed</dt><dd className="text-base font-bold">{sol(r.shares.reduce((a, x) => a + x.sentLamports, 0))} SOL</dd></div>
                <div><dt className="rk-kicker">Sent</dt><dd className="text-base font-bold">{sol(r.shares.reduce((a, x) => a + x.sentLamports, 0))} SOL</dd></div>
              </dl>
              <p className="text-[11px] opacity-70">Claim and send happen in one on-chain step, so claimed and sent move together.</p>
              {r.note ? <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs opacity-80 [overflow-wrap:anywhere]">{r.note}</p> : null}
              <table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase opacity-70"><th className="py-1 pr-3">Receives</th><th className="pr-3">Share</th><th className="pr-3">Waiting</th><th>Sent</th></tr></thead>
                <tbody>{r.shares.map((s) => (
                  <tr key={s.address} className="border-t border-white/10"><td className="py-1 pr-3">{who(s.address)} <span className="font-mono text-[11px] opacity-70">{short(s.address)}</span></td><td className="pr-3">{s.shareBps / 100}%</td><td className="pr-3">{r.distributableLamports == null ? "unknown" : `${sol(s.pendingLamports)} SOL`}</td><td>{sol(s.sentLamports)} SOL</td></tr>))}</tbody></table>
              {r.status === "live" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="rk-btn rk-btn-mint rk-btn-sm" disabled={!r.canDistribute} onClick={() => void pay(r.mint)}>Send fees now</button>
                  <span className="text-xs opacity-80">{r.canDistribute ? "Fees are ready to send." : "Nothing is ready to send yet."}</span>
                </div>
              ) : null}
              {msg[r.mint] ? <p className="text-xs break-all" role="status">{msg[r.mint]}</p> : null}
            </div>
          </SlidePanel>
        );
      })}
    </div>
  );
}
