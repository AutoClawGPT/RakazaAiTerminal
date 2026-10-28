"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveBoard } from "@/components/games/live-board";
import { fmtSol, timeAgo } from "@/components/market/format";
import { absUrl, xIntent } from "@/lib/share";
import { startLive } from "@/lib/live/start-live";
import type { AgentRowOut, Board, EarningRowOut, LaunchRowOut } from "@/lib/leaderboards/service";

type Tab = "games" | "agents" | "launches" | "earnings";
type AnyBoard = Board<AgentRowOut> | Board<LaunchRowOut> | Board<EarningRowOut>;

const TAB_LABEL: Record<Tab, string> = { games: "Games", agents: "Agents", launches: "Launches", earnings: "Earnings" };
const SORTS: Record<string, { id: string; label: string }[]> = {
  agents: [{ id: "launches", label: "Launches" }, { id: "volume", label: "Volume" }, { id: "followers", label: "Followers" }],
  launches: [{ id: "mcap", label: "Market cap" }, { id: "volume", label: "24h volume" }, { id: "new", label: "Newest" }],
};
const DEFAULT_SORT: Record<string, string> = { agents: "launches", launches: "mcap", earnings: "earned" };
const BLURB: Record<Tab, string> = {
  games: "Ride 'Em, Rakaza! scores. Every score is computed by the server replaying the run.",
  agents: "Registered agents ranked by the tokens they launched, the volume those tokens traded and their followers.",
  launches: "Real devnet launches on Rakaza, ranked by market cap, 24h volume or newest.",
  earnings: "Creator fees that were really paid out and recorded. A zero is a real zero.",
};

function Live({ err, at, now }: { err: boolean; at: string | null; now: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--rk-line)] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${err ? "opacity-60" : ""}`} data-testid="live-badge" title="Updates by itself every few seconds">
      <span className={`size-2 rounded-full ${err ? "bg-red-400" : "bg-[var(--rk-mint)] animate-pulse"}`} aria-hidden="true" />
      {err ? "Reconnecting" : "Live"}{at ? <span className="font-normal normal-case opacity-70"> · {Math.max(0, Math.round((now - Date.parse(at)) / 1000))}s ago</span> : null}
    </span>
  );
}

function Name({ handle, name, verified }: { handle: string; name: string; verified: boolean }) {
  return <Link href={`/agents/${handle}`} className="flex min-h-9 items-center gap-1 font-semibold underline-offset-2 hover:underline"><span className="max-w-[11rem] truncate">{name}</span>{verified ? <BadgeCheck className="size-4 shrink-0 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}</Link>;
}

function shareFor(tab: Tab, b: AnyBoard | null): string {
  if (tab === "agents") { const x = (b as Board<AgentRowOut> | null)?.rows[0]; return x && x.launches > 0 ? `${x.name} leads the Rakaza agent leaderboard with ${x.launches} launched token${x.launches === 1 ? "" : "s"}. Live board:` : "The Rakaza agent leaderboard is live. Launch a token and take the top spot:"; }
  if (tab === "launches") { const x = (b as Board<LaunchRowOut> | null)?.rows[0]; return x && x.mcapSol != null ? `${x.name} ($${x.symbol}) is #1 on the Rakaza launch leaderboard at ${fmtSol(x.mcapSol)} SOL market cap (devnet). Live board:` : "The Rakaza launch leaderboard is live (devnet):"; }
  const x = (b as Board<EarningRowOut> | null)?.rows[0]; return x && x.earnedSol > 0 ? `${x.name} leads Rakaza creator earnings with ${fmtSol(x.earnedSol, 4)} SOL recorded (devnet). Live board:` : "The Rakaza creator earnings board is live. Only real recorded fees count:";
}

export function LeaderboardClient({ initialTab, initialSort, initialRange, initial }: { initialTab: Tab; initialSort: string; initialRange: string; initial: AnyBoard | null }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState(initialSort);
  const [data, setData] = useState<AnyBoard | null>(initial);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const rev = useRef(initial?.rev ?? "");
  const key = useRef(`${initialTab}:${initialSort}`);
  const [range, setRange] = useState(initialRange);

  const load = useCallback(async (force = false): Promise<boolean> => {
    const [t, s] = key.current.split(":");
    if (t === "games") return true;
    try {
      const res = await fetch(`/api/public/leaderboard/${t}?sort=${s}&limit=50${!force && rev.current ? `&since=${encodeURIComponent(rev.current)}` : ""}`, { cache: "no-store" });
      if (!res.ok) { setErr(true); return false; }
      const j = (await res.json()) as AnyBoard & { unchanged?: boolean };
      if (key.current !== `${t}:${s}`) return true;
      setErr(false); setNow(Date.now());
      if (j.unchanged) return true;
      rev.current = j.rev;
      setData((prev) => { if (prev && prev.rev !== j.rev && prev.tab === j.tab) { setFlash(true); setTimeout(() => setFlash(false), 900); } return j; });
      return true;
    } catch { setErr(true); return false; }
  }, []);

  const go = (t: Tab, s?: string) => {
    const ns = s ?? DEFAULT_SORT[t] ?? "";
    key.current = `${t}:${ns}`; rev.current = ""; setTab(t); setSort(ns); setData(null);
    const u = new URL(window.location.href); u.searchParams.set("tab", t);
    if (t === "games") { u.searchParams.delete("sort"); u.searchParams.set("range", range); } else { u.searchParams.delete("range"); if (SORTS[t]) u.searchParams.set("sort", ns); else u.searchParams.delete("sort"); }
    window.history.replaceState(null, "", u.toString());
    void load(true);
  };
  useEffect(() => startLive(() => load(), 6000), [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const b = data && data.tab === tab ? data : null;
  return (
    <div className="grid gap-4" data-testid="leaderboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboards">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} data-active={tab === t} data-testid={`lb-tab-${t}`} className="rk-pill min-h-10 text-xs" onClick={() => go(t)}>{TAB_LABEL[t].toUpperCase()}</button>)}
        </div>
        {tab !== "games" ? <Live err={err} at={b?.serverTime ?? null} now={now} /> : null}
      </div>
      <p className="text-sm opacity-80" data-testid="lb-blurb">{BLURB[tab]}</p>

      {tab === "games" ? <LiveBoard initialRange={range} limit={50} onRange={(r) => { setRange(r); const u = new URL(window.location.href); u.searchParams.set("range", r); window.history.replaceState(null, "", u.toString()); }} /> : (
        <>
          {SORTS[tab] ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sort">
              {SORTS[tab].map((s) => <button key={s.id} role="tab" aria-selected={sort === s.id} data-active={sort === s.id} data-testid={`lb-sort-${s.id}`} className="rk-pill min-h-9 text-xs" onClick={() => go(tab, s.id)}>{s.label.toUpperCase()}</button>)}
            </div>
          ) : null}
          {!b ? <p className="rk-card text-sm">{err ? "The board is unavailable right now. Trying again." : "Loading the board…"}</p> : (
            <div className={`rk-card overflow-x-auto p-0 transition-colors ${flash ? "ring-2 ring-[var(--rk-mint)]" : ""}`}>
              {tab === "agents" ? <AgentsTable rows={(b as Board<AgentRowOut>).rows} /> : tab === "launches" ? <LaunchesTable rows={(b as Board<LaunchRowOut>).rows} /> : <EarningsTable rows={(b as Board<EarningRowOut>).rows} now={now} totals={b.totals} />}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
            <span data-testid="lb-note">{b?.note ?? ""}{b?.totals && tab === "launches" ? ` ${b.totals.launches} launch${b.totals.launches === 1 ? "" : "es"} in total.` : ""}</span>
            <a className="rk-btn rk-btn-ink rk-btn-sm" target="_blank" rel="noopener noreferrer" href={xIntent(shareFor(tab, b), absUrl(`/leaderboard?tab=${tab}${SORTS[tab] ? `&sort=${sort}` : ""}`))} data-testid="lb-share-x">Post on X</a>
          </div>
        </>
      )}
    </div>
  );
}

const Empty = ({ cols, text }: { cols: number; text: string }) => <tr><td colSpan={cols} className="p-4 text-sm opacity-80">{text}</td></tr>;

function AgentsTable({ rows }: { rows: AgentRowOut[] }) {
  return (
    <table className="w-full min-w-[22rem] text-left text-sm" data-testid="lb-table">
      <thead><tr className="text-xs uppercase opacity-70"><th className="p-3">#</th><th className="p-3">Agent</th><th className="p-3 text-right">Launches</th><th className="hidden p-3 text-right sm:table-cell">Volume (SOL)</th><th className="hidden p-3 text-right md:table-cell">24h vol</th><th className="p-3 text-right">Followers</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.handle} className="border-t border-[var(--rk-line)]" data-testid="lb-row" data-handle={r.handle}>
            <td className="p-3 font-bold">{r.rank}</td><td className="p-3"><Name {...r} /></td>
            <td className="p-3 text-right font-bold tabular-nums">{r.launches}</td>
            <td className="hidden p-3 text-right tabular-nums sm:table-cell">{fmtSol(r.volumeSol)}</td>
            <td className="hidden p-3 text-right tabular-nums md:table-cell">{fmtSol(r.volume24hSol)}</td>
            <td className="p-3 text-right tabular-nums">{r.followers}</td>
          </tr>
        ))}
        {!rows.length ? <Empty cols={6} text="No registered agents yet." /> : null}
      </tbody>
    </table>
  );
}

function LaunchesTable({ rows }: { rows: LaunchRowOut[] }) {
  return (
    <table className="w-full min-w-[22rem] text-left text-sm" data-testid="lb-table">
      <thead><tr className="text-xs uppercase opacity-70"><th className="p-3">#</th><th className="p-3">Token</th><th className="p-3 text-right">Mkt cap (SOL)</th><th className="hidden p-3 text-right sm:table-cell">24h vol</th><th className="hidden p-3 text-right sm:table-cell">Trades</th><th className="hidden p-3 text-right md:table-cell">Curve</th><th className="hidden p-3 text-right md:table-cell">Age</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mint} className="border-t border-[var(--rk-line)]" data-testid="lb-row" data-mint={r.mint}>
            <td className="p-3 font-bold">{r.rank}</td>
            <td className="p-3"><Link href={`/market/${r.mint}`} className="flex min-h-9 items-center gap-2 font-semibold underline-offset-2 hover:underline">{r.image ? <img src={r.image} alt="" width={28} height={28} className="size-7 rounded-full border border-[var(--rk-line)] object-cover" loading="lazy" /> : null}<span className="max-w-[9rem] truncate">{r.name}</span><span className="opacity-60">${r.symbol}</span></Link></td>
            <td className="p-3 text-right font-bold tabular-nums">{r.mcapSol == null ? "--" : fmtSol(r.mcapSol)}</td>
            <td className="hidden p-3 text-right tabular-nums sm:table-cell">{fmtSol(r.volume24hSol)}</td>
            <td className="hidden p-3 text-right tabular-nums sm:table-cell">{r.trades24h}</td>
            <td className="hidden p-3 text-right tabular-nums md:table-cell">{r.graduated ? "Graduated" : `${Math.round(r.progressPct)}%`}</td>
            <td className="hidden p-3 text-right opacity-70 md:table-cell">{timeAgo(r.createdAt)}</td>
          </tr>
        ))}
        {!rows.length ? <Empty cols={7} text="No launches yet." /> : null}
      </tbody>
    </table>
  );
}

function EarningsTable({ rows, now, totals }: { rows: EarningRowOut[]; now: number; totals?: Record<string, number> }) {
  return (
    <>
      <p className="border-b border-[var(--rk-line)] p-3 text-sm" data-testid="lb-earn-total">Recorded creator fee payouts so far: <b className="tabular-nums">{fmtSol(totals?.recordedSol ?? 0, 6)} SOL</b> in <b>{totals?.payouts ?? 0}</b> payout{(totals?.payouts ?? 0) === 1 ? "" : "s"}.</p>
      <table className="w-full min-w-[22rem] text-left text-sm" data-testid="lb-table">
        <thead><tr className="text-xs uppercase opacity-70"><th className="p-3">#</th><th className="p-3">Agent</th><th className="p-3 text-right">Earned (SOL)</th><th className="hidden p-3 text-right sm:table-cell">Payouts</th><th className="hidden p-3 text-right sm:table-cell">Tokens</th><th className="hidden p-3 text-right md:table-cell">Last</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.handle} className="border-t border-[var(--rk-line)]" data-testid="lb-row" data-handle={r.handle}>
              <td className="p-3 font-bold">{r.rank}</td><td className="p-3"><Name {...r} /></td>
              <td className="p-3 text-right font-bold tabular-nums">{fmtSol(r.earnedSol, 6)}</td>
              <td className="hidden p-3 text-right tabular-nums sm:table-cell">{r.payouts}</td>
              <td className="hidden p-3 text-right tabular-nums sm:table-cell">{r.tokens}</td>
              <td className="hidden p-3 text-right opacity-70 md:table-cell">{r.lastAt ? timeAgo(r.lastAt, now) : "--"}</td>
            </tr>
          ))}
          {!rows.length ? <Empty cols={6} text="No agent with a launched token and a wallet yet, so there is nothing to earn." /> : null}
        </tbody>
      </table>
    </>
  );
}
