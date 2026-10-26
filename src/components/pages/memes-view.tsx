"use client";
import { useState } from "react";
import { MEME_ITEMS } from "@/lib/memes";
import { MemeCard } from "@/components/pages/meme-card";

const TABS = ["All", "Images", "Videos", "Slopcore"] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<Tab, string | null> = { All: null, Images: "image", Videos: "video", Slopcore: "slopcore" };

export function MemesView() {
  const [tab, setTab] = useState<Tab>("All");
  const kind = KIND[tab];
  const items = MEME_ITEMS.filter((m) => !kind || m.kind === kind);
  return (
    <div>
      <div role="tablist" aria-label="Meme type" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rk-btn rk-btn-sm ${tab === t ? "rk-btn-honey" : "rk-btn-white"}`}>
            {t} ({MEME_ITEMS.filter((m) => !KIND[t] || m.kind === KIND[t]).length})
          </button>
        ))}
      </div>
      <ul className={`mt-6 grid gap-6 ${kind === "slopcore" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`} role="tabpanel" data-testid="meme-grid">
        {items.map((m) => <MemeCard key={m.id} m={m} />)}
      </ul>
    </div>
  );
}
