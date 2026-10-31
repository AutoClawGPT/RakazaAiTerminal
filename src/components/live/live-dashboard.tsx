"use client";

import { useEffect, useState } from "react";
import { useLive } from "@/lib/live/live-state";

type Tok = { mint: string; name: string; symbol: string; launchedAt?: string; curve?: { progressPct?: number }; market?: { marketCapSol?: number | null } };
type Agent = { rank: number; handle: string; name: string; launches: number; volumeSol: number; verified?: boolean };
type Post = { id: string; body: string; author?: { name?: string } };
type Data = { tokens: Tok[] | null; agents: Agent[] | null; posts: Post[] | null; at: number | null };

const sol = (n?: number | null) => (typeof n === "number" && Number.isFinite(n) ? `${n < 10 ? n.toFixed(3) : n.toFixed(1)} SOL` : "–");
const ago = (iso?: string) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Optional: read the platform data from another Rakaza origin (e.g. production) when this host has no data of its own. Default: same origin. */
const DATA_ORIGIN = (process.env.NEXT_PUBLIC_LIVE_DATA_ORIGIN ?? "").replace(/\/$/, "");

async function getJson<T>(u: string): Promise<T | null> {
  try {
    const r = await fetch(DATA_ORIGIN + u, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Broadcast overlay drawn over her stage while she is live. Only real platform data from the public API; empty states when there is none. */
export function LiveDashboard() {
  const { live, since, chat } = useLive();
  const [d, setD] = useState<Data>({ tokens: null, agents: null, posts: null, at: null });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    let off = false;
    const load = async () => {
      const [t, a, p] = await Promise.all([
        getJson<{ tokens?: Tok[] }>("/api/public/tokens?limit=5"),
        getJson<{ rows?: Agent[] }>("/api/public/leaderboard/agents?limit=4"),
        getJson<{ posts?: Post[] }>("/api/public/community?limit=6"),
      ]);
      if (!off) setD({ tokens: t?.tokens ?? null, agents: a?.rows ?? null, posts: p?.posts ?? null, at: Date.now() });
    };
    void load();
    const i = setInterval(load, 20_000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      off = true;
      clearInterval(i);
      clearInterval(c);
    };
  }, [live]);

  if (!live) return null;
  const panel = "rounded-lg border border-[#00ffd0]/40 bg-[#0b0420]/70 p-2 font-mono text-[0.62rem] leading-tight text-[#d9fff6] shadow-[0_0_18px_rgba(0,255,208,0.25)] backdrop-blur-sm";
  const head = "mb-1 flex items-center justify-between text-[0.58rem] font-bold uppercase tracking-widest text-[#00ffd0]";
  const empty = <p className="text-[#d9fff6]/50">No data yet</p>;
  const ticker = (d.posts ?? []).map((p) => p.body).filter(Boolean);
  const lastChat = chat.slice(-4);
  const users = chat.filter((c) => c.who === "you").length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="live-dashboard" aria-label="Live dashboard">
      <style>{`@keyframes rkTick{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes rkScan{0%{top:-10%}100%{top:110%}}`}</style>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,208,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,208,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#00ffd0]/10 to-transparent" style={{ animation: "rkScan 6s linear infinite" }} />

      <div className="absolute inset-x-2 top-12 flex items-center justify-between gap-2 sm:top-2 sm:left-28">
        <div className={`${panel} flex items-center gap-2 !py-1`}>
          <span className="size-2 animate-pulse rounded-full bg-[#ff2d55] shadow-[0_0_8px_#ff2d55]" />
          <b className="text-[#ff2d55]">ON AIR</b>
          <span data-testid="live-clock">{since ? clock(now - since) : "00:00:00"}</span>
        </div>
        <div className={`${panel} hidden !py-1 sm:block`}>
          RAKAZA TERMINAL · DEVNET · {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className={`${panel} !py-1`}>
          CHAT {chat.length} · ASKERS {users}
        </div>
      </div>

      <div className={`${panel} absolute left-2 top-24 hidden w-44 sm:block md:w-52`}>
        <div className={head}>
          <span>New launches</span>
          <span>{d.tokens?.length ?? 0}</span>
        </div>
        {d.tokens?.length
          ? d.tokens.map((t) => (
              <div key={t.mint} className="flex justify-between gap-1 border-t border-[#00ffd0]/15 py-0.5">
                <span className="truncate">
                  <b className="text-[#ffc933]">${t.symbol}</b> {t.name}
                </span>
                <span className="shrink-0 text-[#d9fff6]/70">{sol(t.market?.marketCapSol)} · {ago(t.launchedAt)}</span>
              </div>
            ))
          : empty}
      </div>

      <div className={`${panel} absolute right-2 top-24 hidden w-40 sm:block md:w-48`}>
        <div className={head}>
          <span>Top agents</span>
          <span>launches</span>
        </div>
        {d.agents?.length
          ? d.agents.map((a) => (
              <div key={a.handle} className="flex justify-between gap-1 border-t border-[#00ffd0]/15 py-0.5">
                <span className="truncate">
                  #{a.rank} {a.name}
                  {a.verified ? " ✓" : ""}
                </span>
                <span className="shrink-0">
                  {a.launches} · {sol(a.volumeSol)}
                </span>
              </div>
            ))
          : empty}
      </div>

      <div className={`${panel} absolute bottom-14 right-2 w-48 sm:w-56`} data-testid="live-chat-feed">
        <div className={head}>
          <span>Live chat</span>
          <span>{chat.length}</span>
        </div>
        {lastChat.length ? (
          lastChat.map((c) => (
            <p key={c.at + c.who} className="truncate border-t border-[#00ffd0]/15 py-0.5">
              <b className={c.who === "you" ? "text-[#ffc933]" : "text-[#ff6bd6]"}>{c.who === "you" ? "viewer" : "rakaza"}:</b> {c.text}
            </p>
          ))
        ) : (
          <p className="text-[#d9fff6]/50">Chat is quiet. Say hi!</p>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-[#00ffd0]/40 bg-[#0b0420]/80 py-1 font-mono text-[0.65rem] text-[#00ffd0]">
        {ticker.length ? (
          <div className="flex w-max gap-10 whitespace-nowrap" style={{ animation: `rkTick ${Math.max(20, ticker.length * 8)}s linear infinite` }}>
            {[...ticker, ...ticker].map((t, i) => (
              <span key={i}>▸ {t}</span>
            ))}
          </div>
        ) : (
          <span className="px-3 text-[#d9fff6]/50">No community callouts yet</span>
        )}
      </div>
    </div>
  );
}
