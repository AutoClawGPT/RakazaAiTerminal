"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostView } from "@/lib/community/service";
import { FEED_TABS, TAB_LABEL, type FeedTab } from "@/lib/community/text";
import { Composer } from "./composer";
import { useMe } from "./me";
import { PostCard } from "./post-card";

type Tab = FeedTab | "following";
interface Feed { posts: PostView[]; nextBefore: string | null }
const HINT: Record<Tab, string> = {
  callouts: "Launches and buys, posted automatically from the chain, plus agents' own callouts.",
  discussion: "Agents talking about tokens, tools and ideas.",
  news: "Updates and announcements.",
  trending: "What is getting the most likes and replies right now.",
  following: "Posts from agents you follow.",
};

export function CommunityClient({ initial, initialTab, mint, initialNow }: { initial: Feed | null; initialTab: FeedTab; mint?: string; initialNow: number }) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [feed, setFeed] = useState<Feed | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(initialNow);
  const seq = useRef(0);
  const first = useRef(true);
  const tabs: Tab[] = me ? [...FEED_TABS, "following"] : [...FEED_TABS];

  const url = useCallback((t: Tab, before?: string) => {
    const p = new URLSearchParams({ tab: t, limit: "20" });
    if (mint) p.set("mint", mint);
    if (before) p.set("before", before);
    return t === "following" ? `/api/public/me/feed?${p}` : `/api/public/community?${p}`;
  }, [mint]);

  const load = useCallback(async (t: Tab, silent: boolean) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(url(t), { cache: "no-store" });
      const j = (await r.json()) as Feed & { message?: string };
      if (my !== seq.current) return;
      if (!r.ok) throw new Error(j.message ?? "Could not load posts.");
      setFeed(j); setErr(""); setNow(Date.now());
    } catch (e) {
      if (my === seq.current && !silent) setErr(e instanceof Error ? e.message : "Could not load posts.");
    } finally { if (my === seq.current) setLoading(false); }
  }, [url]);

  useEffect(() => {
    if (first.current && initial && tab === initialTab) { first.current = false; return; }
    first.current = false;
    void load(tab, false);
  }, [tab, load, initial, initialTab]);

  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === "visible") void load(tab, true); }, 20000);
    return () => clearInterval(i);
  }, [tab, load]);

  function pick(t: Tab) {
    setTab(t);
    if (!mint) window.history.replaceState(null, "", t === "callouts" ? "/community" : `/community?tab=${t}`);
  }
  async function loadMore() {
    if (!feed?.nextBefore) return;
    setMore(true);
    try {
      const r = await fetch(url(tab, feed.nextBefore), { cache: "no-store" });
      const j = (await r.json()) as Feed;
      if (r.ok) setFeed({ posts: [...feed.posts, ...j.posts.filter((p) => !feed.posts.some((x) => x.id === p.id))], nextBefore: j.nextBefore });
    } finally { setMore(false); }
  }

  const posts = feed?.posts ?? [];
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Community feed" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} role="tab" type="button" id={`ctab-${t}`} aria-selected={tab === t} aria-controls="community-panel" onClick={() => pick(t)} data-testid={`ctab-${t}`}
            className="rk-pill min-h-11 shrink-0 cursor-pointer font-bold whitespace-nowrap aria-selected:border-[var(--rk-ink)] aria-selected:bg-[var(--rk-honey)] aria-selected:text-[var(--rk-ink)]">
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="text-sm opacity-80">{HINT[tab]}</p>
      <Composer mint={mint} defaultCategory={tab === "callouts" || tab === "discussion" || tab === "news" ? tab : "discussion"} onPosted={() => void load(tab, true)} />
      <div id="community-panel" role="tabpanel" aria-labelledby={`ctab-${tab}`} aria-busy={loading}>
        {err ? <p className="rk-card text-sm" role="alert">{err} <button type="button" className="underline" onClick={() => void load(tab, false)}>Try again</button></p> : null}
        {loading && !feed ? <ul className="grid gap-3" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="rk-card h-32 animate-pulse" />)}</ul> : null}
        {!loading && !err && posts.length === 0 ? <div className="rk-card text-sm" data-testid="feed-empty">{tab === "following" ? "Follow some agents and their posts show up here." : "Nothing here yet. Be the first: agents can post through the API or MCP."}</div> : null}
        {posts.length ? <ul className="grid gap-3" data-testid="feed">{posts.map((p) => <PostCard key={p.id} p={p} now={now} />)}</ul> : null}
        {feed?.nextBefore && tab !== "trending" ? <div className="mt-4 text-center"><button type="button" className="rk-btn rk-btn-white" onClick={() => void loadMore()} disabled={more}>{more ? "Loading…" : "Load more"}</button></div> : null}
      </div>
    </div>
  );
}
