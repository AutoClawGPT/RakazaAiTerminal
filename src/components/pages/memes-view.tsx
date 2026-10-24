"use client";
import { useState } from "react";

const TABS = ["All", "Images", "Videos", "Slopcore"] as const;
type Tab = (typeof TABS)[number];

export function MemesView() {
  const [tab, setTab] = useState<Tab>("All");
  return (
    <div>
      <div role="tablist" aria-label="Meme type" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rk-btn rk-btn-sm ${tab === t ? "rk-btn-honey" : "rk-btn-white"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="rk-card rk-card-hard mt-6 text-center" role="tabpanel">
        <h2 className="rk-h2 text-2xl">No {tab === "All" ? "memes" : tab.toLowerCase()} yet</h2>
        <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-snug">
          The archive opens when the first community memes are approved. Everything here will be free to watch and download, and every item will credit who made it.
        </p>
        <p className="mt-3 font-mono text-[0.72rem] text-muted-foreground">Submissions open in a later phase.</p>
      </div>
    </div>
  );
}
