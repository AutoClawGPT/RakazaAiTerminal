"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ledgerAction } from "@/app/(dash)/history/actions";
import type { Ledger, LedgerRow } from "@/lib/launch/ledger";

const sol = (l: number) => (l / 1e9).toFixed(l >= 1e7 ? 4 : 6);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function useLedger() {
  const [data, setData] = useState<Ledger | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const r = await ledgerAction(); if (r.ok) { setData(r); setErr(""); } else setErr(r.error); }, []);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000); return () => clearInterval(t); }, [load]);
  return { data, err };
}

const Shell = ({ err, data, children, empty }: { err: string; data: Ledger | null; children: React.ReactNode; empty?: string }) => (
  <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
    {err ? <p className="rk-card text-sm text-red-400" role="alert" data-testid="ledger-err">{err}</p> : null}
    {!data && !err ? <p className="rk-card text-sm opacity-80">Loading…</p> : null}
    {data && data.rows.length === 0 ? <p className="rk-card text-sm">{empty ?? "Nothing launched yet."}</p> : children}
  </div>
);

export function RevenueView({ treasury }: { treasury?: string }) {
  const { data, err } = useLedger();
  const mine = useMemo(() => {
    if (!data || !treasury) return null;
    const w = data.wallets.find((x) => x.wallet === treasury);
    const byDay = new Map<string, number>();
    for (const p of data.payoutsByDay ?? []) if (p.wallet === treasury) byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.lamports);
    const perToken = data.rows.map((r) => ({ r, s: r.shares.find((x) => x.address === treasury) })).filter((x) => x.s);
    return { sent: w?.sentLamports ?? 0, pending: w?.pendingLamports ?? 0, days: [...byDay.entries()], perToken };
  }, [data, treasury]);
  return (
    <Shell err={err} data={data} empty="No launches yet, so there is no platform revenue yet. The platform’s 30% share appears here once fees start coming in.">
      {mine ? (
        <>
          <section className="rk-card" data-testid="revenue-totals"><dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="rk-kicker">Platform share sent</dt><dd className="text-xl font-bold">{sol(mine.sent)} SOL</dd></div>
            <div><dt className="rk-kicker">Platform share waiting</dt><dd className="text-xl font-bold">{sol(mine.pending)} SOL</dd></div></dl></section>
          <section className="rk-card"><h2 className="rk-h2 text-xl">Last 30 days</h2>
            {mine.days.length === 0 ? <p className="mt-2 text-sm opacity-80">No fees have been sent yet.</p> : (
              <ul className="mt-3 grid gap-2 text-sm">{mine.days.map(([d, l]) => { const max = Math.max(...mine.days.map((x) => x[1])); return <li key={d} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3"><span>{d}</span><span className="h-3 rounded-full bg-white/10"><span className="block h-3 rounded-full bg-[var(--rk-mint)]" style={{ width: `${Math.max(4, (l / max) * 100)}%` }} /></span><span>{sol(l)} SOL</span></li>; })}</ul>)}
          </section>
          <section className="rk-card"><h2 className="rk-h2 text-xl">By token</h2>
            <ul className="mt-3 grid gap-2 text-sm">{mine.perToken.map(({ r, s }) => <li key={r.mint} className="flex flex-wrap justify-between gap-2"><Link className="underline" href={`/token/${r.mint}`}>{r.name} ({r.symbol})</Link><span>{sol(s!.sentLamports)} SOL sent, {sol(s!.pendingLamports)} waiting</span></li>)}</ul></section>
        </>
      ) : <p className="rk-card text-sm text-amber-300">The treasury address is not set, so platform revenue cannot be separated out.</p>}
    </Shell>
  );
}

export function RewardsView({ treasury }: { treasury?: string }) {
  const { data, err } = useLedger();
  return (
    <Shell err={err} data={data} empty="No rewards yet. Each launch’s fee shares are listed here as soon as it is live.">
      {data ? (
        <section className="rk-card"><div className="overflow-x-auto"><table className="w-full text-left text-sm" data-testid="rewards-table">
          <thead><tr className="text-xs uppercase opacity-70"><th className="py-2 pr-3">Token</th><th className="pr-3">Wallet</th><th className="pr-3">Share</th><th className="pr-3">Waiting</th><th>Sent</th></tr></thead>
          <tbody>{data.rows.flatMap((r) => r.shares.map((s) => (
            <tr key={`${r.mint}${s.address}`} className="border-t border-white/10"><td className="py-2 pr-3"><Link className="underline" href={`/token/${r.mint}`}>{r.symbol}</Link></td><td className="pr-3 font-mono text-xs">{short(s.address)}{s.address === treasury ? " (platform)" : ""}</td><td className="pr-3">{s.shareBps / 100}%</td><td className="pr-3">{sol(s.pendingLamports)}</td><td>{sol(s.sentLamports)}</td></tr>)))}</tbody>
        </table></div></section>
      ) : null}
    </Shell>
  );
}

type Sort = "new" | "name" | "sent";
export function ExploreView() {
  const { data, err } = useLedger();
  const [sort, setSort] = useState<Sort>("new");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [] as LedgerRow[];
    const sent = (r: LedgerRow) => r.shares.reduce((a, s) => a + s.sentLamports, 0);
    return data.rows.filter((r) => (status === "all" || r.status === status) && (mode === "all" || r.mode === mode) && (!q || `${r.name} ${r.symbol} ${r.mint}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "sent" ? sent(b) - sent(a) : +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [data, sort, status, mode, q]);
  const sel = "min-h-11 rounded-xl border border-white/20 bg-black/20 px-3 text-sm";
  return (
    <Shell err={err} data={data} empty="Nothing has launched through the platform yet.">
      <section className="rk-card grid gap-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="sr-only" htmlFor="x-q">Search</label><input id="x-q" className={`${sel} sm:col-span-2`} placeholder="Search name, ticker or address" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="sr-only" htmlFor="x-s">Sort</label><select id="x-s" className={sel} value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="new">Newest</option><option value="name">Name</option><option value="sent">Most fees sent</option></select>
          <label className="sr-only" htmlFor="x-st">Status</label><select id="x-st" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="live">Live</option><option value="created_unsplit">Split pending</option><option value="failed">Failed</option></select>
          <label className="sr-only" htmlFor="x-m">Type</label><select id="x-m" className={sel} value={mode} onChange={(e) => setMode(e.target.value)}><option value="all">All launch types</option><option value="sponsored">Agent launch</option><option value="own-wallet">Self launch</option></select>
        </div>
        <ul className="grid gap-2" data-testid="explore-list">{rows.map((r) => (
          <li key={r.mint}><Link href={`/token/${r.mint}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10"><span><b>{r.name}</b> ({r.symbol}) <span className="opacity-70">· {r.mode === "sponsored" ? "agent" : "self"} · {r.network}</span></span><span className="text-xs">{r.status}</span></Link></li>))}
          {rows.length === 0 ? <li className="text-sm opacity-80">No launches match.</li> : null}
        </ul>
      </section>
    </Shell>
  );
}
