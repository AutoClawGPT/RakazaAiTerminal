"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicToken } from "@/lib/market/types";
import { TokenCard } from "./token-card";

type Tab = "new" | "graduating" | "graduated" | "trending";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "Just launched" },
  { id: "graduating", label: "Graduating soon", hint: "Curve 60% full or more" },
  { id: "graduated", label: "Graduated", hint: "Moved to a DEX" },
  { id: "trending", label: "Trending", hint: "Most trades in the last 24 hours" },
];
const PAGE = 24;

interface ListOut { ok: boolean; tokens: PublicToken[]; hasMore: boolean; network?: string; message?: string }

export function ExploreClient({ initial, initialNow }: { initial: ListOut | null; initialNow: number }) {
  const [tab, setTab] = useState<Tab>("new");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [data, setData] = useState<ListOut | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === null);
  const [more, setMore] = useState(false);
  const [now, setNow] = useState(initialNow);
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async (silent: boolean) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const p = new URLSearchParams({ tab, limit: String(PAGE) });
      if (term) p.set("q", term);
      const r = await fetch(`/api/public/tokens?${p}`, { cache: "no-store" });
      const j = (await r.json()) as ListOut;
      if (my !== seq.current) return;
      if (!r.ok || !j.ok) throw new Error(j.message ?? "Could not load tokens.");
      setData(j); setErr(null); setNow(Date.now());
    } catch (e) {
      if (my !== seq.current) return;
      if (!silent) setErr(e instanceof Error ? e.message : "Could not load tokens.");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [tab, term]);

  useEffect(() => {
    if (first.current && initial && tab === "new" && !term) { first.current = false; return; }
    first.current = false;
    void load(false);
  }, [load, initial, tab, term]);

  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 12000);
    return () => clearInterval(i);
  }, [load]);

  async function loadMore() {
    if (!data) return;
    setMore(true);
    try {
      const p = new URLSearchParams({ tab, limit: String(PAGE), offset: String(data.tokens.length) });
      if (term) p.set("q", term);
      const r = await fetch(`/api/public/tokens?${p}`, { cache: "no-store" });
      const j = (await r.json()) as ListOut;
      if (r.ok && j.ok) setData({ ...j, tokens: [...data.tokens, ...j.tokens.filter((t) => !data.tokens.some((x) => x.mint === t.mint))] });
    } finally { setMore(false); }
  }

  const tokens = data?.tokens ?? [];
  const active = TABS.find((t) => t.id === tab)!;
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-center">
        <div role="tablist" aria-label="Token lists" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="token-panel"
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className="rk-pill min-h-11 shrink-0 cursor-pointer font-bold whitespace-nowrap aria-selected:border-[var(--rk-ink)] aria-selected:bg-[var(--rk-honey)] aria-selected:text-[var(--rk-ink)]"
            >
              {t.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="token-search" className="sr-only">Search by name, ticker or address</label>
          <input
            id="token-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ticker or address"
            autoComplete="off"
            className="min-h-11 w-full rounded-full border-2 border-[var(--rk-line)] bg-black/20 px-4 text-sm"
            data-testid="token-search"
          />
        </div>
      </div>
      <p className="text-xs opacity-80" aria-live="polite">{active.hint}. Updates every few seconds.</p>
      <div id="token-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading}>
        {err ? (
          <div className="rk-card grid gap-3" role="alert">
            <p className="text-sm">{err}</p>
            <button type="button" className="rk-btn rk-btn-honey justify-self-start" onClick={() => void load(false)}>Try again</button>
          </div>
        ) : loading && tokens.length === 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
            {[0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="rk-card h-44 animate-pulse opacity-60" />)}
          </ul>
        ) : tokens.length === 0 ? (
          <div className="rk-card text-sm" data-testid="token-empty">
            {term ? `No tokens match "${term}".` : tab === "new" ? "Nothing has launched yet. Be the first." : tab === "graduating" ? "No token is close to graduating right now." : tab === "graduated" ? "No token has graduated yet." : "Nothing is trading yet."}
          </div>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="token-grid">
              {tokens.map((t) => <TokenCard key={t.mint} t={t} now={now} />)}
            </ul>
            {data?.hasMore ? (
              <div className="mt-5 grid justify-center">
                <button type="button" className="rk-btn rk-btn-ink" disabled={more} onClick={() => void loadMore()}>{more ? "Loading..." : "Load more"}</button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
