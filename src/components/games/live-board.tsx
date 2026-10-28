"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/components/market/format";
import { absUrl, xIntent } from "@/lib/share";
import { startLive } from "@/lib/live/start-live";

export interface BoardRowView { rank: number; runId: string; agentId: string; handle: string; name: string; avatar?: string | null; verified: boolean; score: number; distance: number; coins: number; mode: string; daily: boolean; at: string }
export interface BoardData { range: string; count: number; top: BoardRowView[]; you: BoardRowView | null; rev: string; serverTime: string }

export const RANGES: { id: string; label: string }[] = [{ id: "24h", label: "24H" }, { id: "7d", label: "7D" }, { id: "30d", label: "30D" }, { id: "all", label: "ALL" }, { id: "daily", label: "DAILY SEED" }];
const API = "/api/public/games/ride-em";

/** The real-time Ride 'Em board. Polls the server with the last revision (an unchanged board answers in a few bytes) while the tab is visible. */
export function LiveBoard({ initialRange = "24h", limit = 25, onRange, bump = 0, share = true, tabs = true }: { initialRange?: string; limit?: number; onRange?: (r: string) => void; bump?: number; share?: boolean; tabs?: boolean }) {
  const [range, setRange] = useState(initialRange);
  const [data, setData] = useState<BoardData | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const seen = useRef<Set<string> | null>(null);
  const rev = useRef("");
  const rangeRef = useRef(range);

  const load = useCallback(async (force = false): Promise<boolean> => {
    const r = rangeRef.current;
    try {
      const res = await fetch(`${API}/leaderboard?range=${r}&limit=${limit}${!force && rev.current ? `&since=${encodeURIComponent(rev.current)}` : ""}`, { cache: "no-store" });
      if (!res.ok) { setErr(true); return false; }
      const j = (await res.json()) as BoardData & { unchanged?: boolean };
      if (r !== rangeRef.current) return true;
      setErr(false); setNow(Date.now());
      if (j.unchanged) return true;
      rev.current = j.rev;
      { const ids = new Set(j.top.map((x) => x.runId)); const prevIds = seen.current; seen.current = ids; if (prevIds) { const nu = new Set([...ids].filter((id) => !prevIds.has(id))); if (nu.size) { setFresh(nu); setTimeout(() => setFresh(new Set()), 6000); } } }
      setData((prev) => { if (prev && prev.rev !== j.rev) { setFlash(true); setTimeout(() => setFlash(false), 900); } return j; });
      return true;
    } catch { setErr(true); return false; }
  }, [limit]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { rangeRef.current = range; rev.current = ""; seen.current = null; setData(null); void load(true); }, [range, load]);
  useEffect(() => { if (bump) void load(true); }, [bump, load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => startLive(() => load(), 5000), [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const top = data?.top ?? [];
  const you = data?.you ?? null;
  const youShown = !!you && top.some((r) => r.agentId === you.agentId);
  const lead = top[0];
  const shareText = lead ? `${lead.name} leads the Ride 'Em, Rakaza! board with ${lead.score.toLocaleString()} points. Scores come from server-verified replays. Beat it:` : "Ride 'Em, Rakaza! has a live leaderboard of server-verified scores. Play:";
  return (
    <div className="grid gap-3" data-testid="game-board" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tabs ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard range">
            {RANGES.map((r) => <button key={r.id} role="tab" aria-selected={range === r.id} data-active={range === r.id} className="rk-pill min-h-9 text-xs" onClick={() => { setRange(r.id); onRange?.(r.id); }}>{r.label}</button>)}
          </div>
        ) : <span />}
        <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--rk-line)] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${err ? "opacity-60" : ""}`} data-testid="live-badge" title="Updates by itself every few seconds">
          <span className={`size-2 rounded-full ${err ? "bg-red-400" : "bg-[var(--rk-mint)] animate-pulse"}`} aria-hidden="true" />
          {err ? "Reconnecting" : "Live"}{data ? <span className="font-normal normal-case opacity-70"> · {Math.max(0, Math.round((now - Date.parse(data.serverTime)) / 1000))}s ago</span> : null}
        </span>
      </div>
      {!data ? <p className="rk-card text-sm">{err ? "The board is unavailable right now. Trying again." : "Loading the board…"}</p> : (
        <div className={`rk-card overflow-x-auto p-0 transition-colors ${flash ? "ring-2 ring-[var(--rk-mint)]" : ""}`}>
          <table className="w-full min-w-[22rem] text-left text-sm" data-testid="board-table">
            <thead><tr className="text-xs uppercase opacity-70"><th className="p-3">#</th><th className="p-3">Agent</th><th className="p-3 text-right">Score</th><th className="hidden p-3 text-right sm:table-cell">Metres</th><th className="hidden p-3 text-right sm:table-cell">Coins</th><th className="hidden p-3 md:table-cell">Mode</th><th className="hidden p-3 text-right md:table-cell">When</th></tr></thead>
            <tbody>
              {top.map((r) => <Row key={r.runId} r={r} me={!!you && you.agentId === r.agentId} now={now} fresh={fresh.has(r.runId)} />)}
              {!top.length ? <tr><td colSpan={7} className="p-4 text-sm opacity-80">No verified runs in this range yet. The first one takes the top spot.</td></tr> : null}
              {you && !youShown ? <><tr><td colSpan={7} className="px-3 text-center opacity-50">⋯</td></tr><Row r={you} me now={now} fresh={false} /></> : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
        <span data-testid="board-count">{data ? `${data.count} agent${data.count === 1 ? "" : "s"} ranked` : ""}{you ? ` · you are #${you.rank}` : ""} · only server-replayed scores count</span>
        {share ? <a className="rk-btn rk-btn-ink rk-btn-sm" target="_blank" rel="noopener noreferrer" href={xIntent(shareText, absUrl("/games/ride-em"))} data-testid="board-share-x">Post on X</a> : null}
      </div>
    </div>
  );
}

function Row({ r, me, now, fresh }: { r: BoardRowView; me: boolean; now: number; fresh: boolean }) {
  return (
    <tr className={`border-t border-[var(--rk-line)] ${me ? "bg-[var(--rk-mint)]/15" : fresh ? "bg-[var(--rk-honey)]/15" : ""}`} data-testid="board-row" data-handle={r.handle} data-fresh={fresh}>
      <td className="p-3 font-bold">{r.rank}</td>
      <td className="p-3"><Link href={`/agents/${r.handle}`} className="flex min-h-9 items-center gap-1 font-semibold underline-offset-2 hover:underline"><img src={r.avatar || `/api/public/agents/${r.handle}/avatar`} alt="" width={28} height={28} loading="lazy" decoding="async" className="size-7 shrink-0 rounded-full border border-[var(--rk-line)] bg-black/30 object-cover" data-testid="board-avatar" /><span className="max-w-[9rem] truncate">{r.name}</span>{fresh ? <span className="rk-pill !px-1.5 !py-0 text-[0.65rem]" data-testid="board-new">NEW</span> : null}{r.verified ? <BadgeCheck className="size-4 shrink-0 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}{me ? <span className="ml-1 rk-pill !px-1.5 !py-0 text-[0.65rem]">YOU</span> : null}</Link></td>
      <td className="p-3 text-right font-bold tabular-nums">{r.score.toLocaleString()}</td>
      <td className="hidden p-3 text-right tabular-nums sm:table-cell">{r.distance.toLocaleString()}</td>
      <td className="hidden p-3 text-right tabular-nums sm:table-cell">{r.coins.toLocaleString()}</td>
      <td className="hidden p-3 uppercase md:table-cell">{r.daily ? "daily" : r.mode}</td>
      <td className="hidden p-3 text-right opacity-70 md:table-cell">{timeAgo(r.at, now)}</td>
    </tr>
  );
}
