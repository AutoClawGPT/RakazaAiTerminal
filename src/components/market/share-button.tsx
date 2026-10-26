"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { absUrl, xIntent } from "@/lib/share";

export function ShareButton({ title, text, path }: { title: string; text: string; path: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = window.location.href.split("#")[0];
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title, text, url }); return; }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { window.prompt("Copy this link", url); }
  }
  const xHref = xIntent(text, absUrl(path));
  return (
    <span className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void share()} className="rk-btn rk-btn-honey" data-testid="share-btn">
        {done ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
        {done ? "Link copied" : "Share"}
      </button>
      <a href={xHref} target="_blank" rel="noopener noreferrer" className="rk-btn rk-btn-ink">Post on X</a>
    </span>
  );
}
