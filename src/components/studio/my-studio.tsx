"use client";
/* eslint-disable @next/next/no-img-element -- tiny data URL thumbnails */
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { clearMine, type MyImage, type MyLaunch } from "@/lib/me-store";

function subscribe(cb: () => void) {
  window.addEventListener("rakaza-me", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("rakaza-me", cb); window.removeEventListener("storage", cb); };
}
const snap = () => `${window.localStorage.getItem("rakaza.me.launches") ?? "[]"}\u0000${window.localStorage.getItem("rakaza.me.images") ?? "[]"}`;

export function MyStudio() {
  const raw = useSyncExternalStore(subscribe, snap, () => "[]\u0000[]");
  const { launches, images } = useMemo(() => {
    const [a, b] = raw.split("\u0000");
    const p = <T,>(s: string): T[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };
    return { launches: p<MyLaunch>(a), images: p<MyImage>(b) };
  }, [raw]);
  const empty = launches.length === 0 && images.length === 0;

  return (
    <div className="grid gap-5" data-testid="my-studio">
      <p className="text-sm opacity-80">Saved only in this browser. No sign-in, nothing is sent anywhere. Clearing your browser data removes it.</p>
      <div className="rk-card grid gap-3" data-testid="my-launches">
        <p className="rk-kicker">Your launches</p>
        {launches.length === 0 ? <p className="text-sm">No launches yet. <Link href="/self-launch" className="underline">Launch a token from your own wallet</Link>.</p> : (
          <ul className="grid gap-2">
            {launches.map((l) => (
              <li key={l.mint} className="rounded-xl border border-[var(--rk-line)] p-3 text-sm">
                <b>{l.name}</b> (${l.symbol}) · {l.network} · {new Date(l.at).toLocaleString()}
                <p className="break-all font-mono text-xs">{l.mint}</p>
                <a className="underline" target="_blank" rel="noreferrer" href={`https://solscan.io/token/${l.mint}${l.network === "devnet" ? "?cluster=devnet" : ""}`}>Solscan</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rk-card grid gap-3" data-testid="my-images">
        <p className="rk-kicker">Recent generated images</p>
        {images.length === 0 ? <p className="text-sm">None yet. Generate one on the <Link href="/self-launch" className="underline">Self launch</Link> page.</p> : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((i) => <li key={i.at} title={i.prompt}><img src={i.thumb} alt={i.prompt || "Generated image"} className="aspect-square w-full rounded-xl object-cover" /></li>)}
          </ul>
        )}
      </div>
      {!empty ? <button type="button" className="rk-btn rk-btn-white rk-btn-sm justify-self-start" onClick={() => { if (window.confirm("Remove your saved launches and images from this browser?")) clearMine(); }}>Clear this device</button> : null}
    </div>
  );
}
