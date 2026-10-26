"use client";
import { useState } from "react";
import data from "@/lib/memes.json";

const TABS = ["All", "Images", "Videos", "Slopcore"] as const;
type Tab = (typeof TABS)[number];

const SITE = "https://rakaza-ai-terminal.vercel.app";

function shareUrl(id: string, text: string) {
  const msg = `${text} #Rakaza`;
  return `https://x.com/intent/post?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(`${SITE}/memes/${id}.jpg`)}`;
}

export function MemesView() {
  const [tab, setTab] = useState<Tab>("All");
  const showImages = tab === "All" || tab === "Images";
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
      {showImages ? (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="tabpanel" data-testid="meme-grid">
          {data.memes.map((m) => (
            <li key={m.id} className="rk-card rk-card-hard flex flex-col gap-3 !p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/memes/${m.id}.jpg`} alt={m.alt} width={768} height={768} loading="lazy" className="aspect-square w-full rounded-lg border-[3px] border-[var(--rk-ink)] object-cover" />
              <p className="font-semibold leading-snug">
                {m.top} {m.bottom}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <a href={`/memes/${m.id}.jpg`} download={`rakaza-${m.id}.jpg`} className="rk-btn rk-btn-honey rk-btn-sm">
                  Download
                </a>
                <a href={shareUrl(m.id, `${m.top} ${m.bottom}`)} target="_blank" rel="noopener noreferrer" className="rk-btn rk-btn-white rk-btn-sm">
                  Share on X
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rk-card rk-card-hard mt-6 text-center" role="tabpanel">
          <h2 className="rk-h2 text-2xl">No {tab.toLowerCase()} yet</h2>
          <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-snug">
            Only image memes are published so far. Videos and slopcore clips are not up yet, so this tab stays empty until they are.
          </p>
        </div>
      )}
    </div>
  );
}
