"use client";

import { useEffect, useState } from "react";
import { useLive } from "@/lib/live/live-state";

type Tok = { mint: string; name: string; symbol: string; launchedAt?: string; curve?: { progressPct?: number }; market?: { marketCapSol?: number | null } };
type Agent = { rank: number; handle: string; name: string; launches: number; volumeSol: number; verified?: boolean };
type Post = { id: string; body: string; author?: { name?: string } };
type Data = { tokens: Tok[] | null; agents: Agent[] | null; posts: Post[] | null; at: number | null };

const sol = (n?: number | null) => (typeof n === "number" && Number.isFinite(n) ? `${n < 10 ? n.toFixed(2) : n.toFixed(1)} SOL` : "–");
const ago = (iso?: string) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};


async function getJson<T>(u: string): Promise<T | null> {
  try {
    const r = await fetch(u, { cache: "no-store" });
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
        getJson<{ tokens?: Tok[] }>("/api/live/feed?kind=tokens"),
        getJson<{ rows?: Agent[] }>("/api/live/feed?kind=agents"),
        getJson<{ posts?: Post[] }>("/api/live/feed?kind=community"),
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
  const panel = "rounded-md border border-[#00ffd0]/60 bg-[#07021a]/85 p-2 font-mono text-[0.68rem] leading-tight text-[#d9fff6] shadow-[0_0_18px_rgba(0,255,208,0.25)] backdrop-blur-sm";
  const head = "mb-1 flex items-center justify-between border-b border-[#00ffd0]/40 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-[#00ffd0]";
  const empty = <p className="text-[#d9fff6]/50">No data yet</p>;
  const ticker = (d.posts ?? []).map((p) => p.body).filter(Boolean);
  const lastChat = chat.slice(-4);
  const users = chat.filter((c) => c.who === "you").length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="live-dashboard" aria-label="Live dashboard">
      <style>{`@keyframes rkTick{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes rkScan{0%{top:-10%}100%{top:110%}}`}</style>
      <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,255,208,0.25)]" />
      <span className="absolute left-1 top-1 size-5 border-l-2 border-t-2 border-[#00ffd0]" /><span className="absolute right-1 top-1 size-5 border-r-2 border-t-2 border-[#00ffd0]" /><span className="absolute bottom-8 left-1 size-5 border-b-2 border-l-2 border-[#00ffd0]" /><span className="absolute bottom-8 right-1 size-5 border-b-2 border-r-2 border-[#00ffd0]" />
      <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#00ffd0]/10 to-transparent" style={{ animation: "rkScan 6s linear infinite" }} />

      <div className="absolute inset-x-2 top-12 flex items-center justify-between gap-2 sm:top-2 sm:left-28">
        <div className={`${panel} flex items-center gap-2 whitespace-nowrap !py-1`}>
          <span className="size-2 animate-pulse rounded-full bg-[#ff2d55] shadow-[0_0_8px_#ff2d55]" />
          <b className="text-[#ff2d55]">ON AIR</b>
          <span data-testid="live-clock">{since ? clock(now - since) : "00:00:00"}</span>
        </div>
        <div className={`${panel} hidden whitespace-nowrap !py-1 xl:block`}>
          RAKAZA TERMINAL · DEVNET · {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className={`${panel} hidden whitespace-nowrap !py-1 sm:block`}>
          CHAT {chat.length} · ASKERS {users}
        </div>
      </div>

      <div className={`${panel} absolute left-3 top-16 hidden w-60 sm:block`}>
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

      <div className={`${panel} absolute right-3 top-16 hidden w-52 sm:block`}>
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

      <div className={`${panel} absolute bottom-24 left-3 w-52 max-w-[70%] overflow-hidden sm:left-auto sm:right-3 sm:bottom-14 sm:w-60 sm:max-w-none`} data-testid="live-chat-feed">
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
