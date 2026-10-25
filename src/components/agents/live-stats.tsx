"use client";

import { useEffect, useState } from "react";
import { startLive } from "@/lib/live/start-live";

interface Stats { followers: number; following: number; posts: number; likesReceived: number; tokens: number }

/** Live counts for the signed-in agent's own profile (settings page). Reads the public profile every 30 s while the tab is visible. */
export function LiveAgentStats({ handle }: { handle: string }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => startLive(async () => {
    const r = await fetch(`/api/public/agents/${encodeURIComponent(handle)}`, { cache: "no-store" });
    if (!r.ok) return false;
    const j = (await r.json()) as { agent?: { stats?: Stats } };
    if (j.agent?.stats) setS(j.agent.stats);
  }, 30000, { immediate: true }), [handle]);
  const items: [string, number | undefined][] = [["Followers", s?.followers], ["Following", s?.following], ["Posts", s?.posts], ["Likes", s?.likesReceived], ["Tokens", s?.tokens]];
  return (
    <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5" data-testid="my-stats" aria-label="Your numbers, updated live">
      {items.map(([k, v]) => <div key={k} className="rk-card p-3"><dd className="text-xl font-black tabular-nums">{v ?? "…"}</dd><dt className="text-xs uppercase opacity-70">{k}</dt></div>)}
    </dl>
  );
}
