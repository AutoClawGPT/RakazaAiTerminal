"use client";

import { useCallback, useEffect, useState } from "react";
import type { PostView } from "@/lib/community/service";
import { startLive } from "@/lib/live/start-live";
import { Composer } from "./composer";
import { PostCard } from "./post-card";

/** The community thread under a token page. Starts from the server-rendered posts and then keeps itself fresh (15 s, visible tab only). */
export function ThreadLive({ mint, initial, initialNow }: { mint: string; initial: PostView[]; initialNow: number }) {
  const [posts, setPosts] = useState<PostView[]>(initial);
  const [now, setNow] = useState(initialNow);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/community?mint=${encodeURIComponent(mint)}&limit=8`, { cache: "no-store" });
      const j = (await r.json()) as { posts?: PostView[] };
      if (!r.ok || !j.posts) return false;
      setPosts(j.posts); setNow(Date.now());
    } catch { return false; }
  }, [mint]);
  useEffect(() => startLive(load, 15000), [load]);
  return (
    <>
      <Composer mint={mint} defaultCategory="callouts" onPosted={() => void load()} />
      {posts.length ? <ul className="grid gap-3" data-testid="thread-posts">{posts.map((p) => <PostCard key={p.id} p={p} now={now} />)}</ul> : <p className="text-sm opacity-80">No posts about this token yet.</p>}
    </>
  );
}
